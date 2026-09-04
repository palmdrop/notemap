import { recordAction } from "../actions";
import { enqueueMirrorWrite } from "../mirror";
import { ok, refused } from "#utils/result";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { CancelRefusal, DeliveryRefusal } from "#types/api/refusal";
import type { FailureDetail } from "#types/domain/enrichment";
import type {
  ItemId,
  JobId,
  RoutingRecordId,
  Timestamp,
} from "#types/domain/ids";
import type {
  DeliveryLanding,
  DeliveryOutcome,
  DeliveryRequest,
  RoutingRecord,
} from "#types/domain/routing";
import type { Result } from "#types/result";
import { DELIVERY_FAILURE, destinationDetail } from "./delivery";
import { landingFor, type Landed } from "./output";
import { prepare } from "./prepare";

type Routed = Result<RoutingRecord, DeliveryRefusal>;

/**
 * The decision, and one delivery attempt inline. Everything checkable is
 * checked first, and the adapter is then called outside any transaction.
 */
export async function route(
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Routed> {
  const prepared = await prepare(ports, item, request, signal);
  // Nothing has been attempted and nothing written, so a destination that could
  // not describe itself refuses rather than reserving: a record minted here
  // would carry arguments nobody validated, and every retry would refuse again.
  if (prepared.kind === "refused") return refused(prepared.refusal);

  const { destination, delivery } = prepared.value;
  const record: RoutingRecord = {
    id: ports.ids.next<RoutingRecordId>(),
    item,
    target: {
      kind: "destination",
      destination: request.destination,
      capability: request.capability,
      arguments: request.arguments,
    },
    state: "pending",
    at: ports.clock.now(),
  };

  let outcome: DeliveryOutcome;
  try {
    outcome = await ports.destinations.deliver(destination, delivery, signal);
  } catch (cause) {
    return unresolved(ports, record, cause);
  }

  // Before the transaction, because storing what came back reads a stream the
  // adapter is still holding open, and the store locks for as long as one runs.
  const landed =
    outcome.kind === "delivered"
      ? await landingFor(ports, outcome, signal)
      : undefined;

  return ports.store.transaction(async (tx) => {
    // Read back while the adapter had the bytes: the record cannot be written
    // without either of them, but the entry saying bytes left the machine
    // outlives both.
    const present = (await tx.item(item)) !== undefined;
    const held = await tx.destination(request.destination);

    await trace(ports, tx, record, outcome, landed);
    if (!present) {
      return refused<RoutingRecord, DeliveryRefusal>({
        kind: "item-purged",
        item,
        at: record.at,
      });
    }
    if (held === undefined) {
      return refused<RoutingRecord, DeliveryRefusal>({
        kind: "unknown-destination",
        destination: request.destination,
      });
    }

    switch (outcome.kind) {
      case "delivered":
        return deliver(ports, tx, record, landed?.landing ?? {});
      case "unreachable":
        return reserve(ports, tx, record);
      case "rejected":
        return refused<RoutingRecord, DeliveryRefusal>({
          kind: "rejected-by-destination",
          detail: outcome.detail,
        });
    }
  });
}

/**
 * The adapter neither answered nor refused, so whether anything arrived is not
 * knowable: aborting stops the waiting, not the destination. Nothing is retried
 * and no record is written — the item never left the queue — but the attempt
 * goes on the log, because somebody about to route again has to be able to find
 * it. A host that dies here rather than throwing leaves nothing at all, which
 * `core.md` says plainly.
 */
function unresolved(
  ports: PoolPorts,
  record: RoutingRecord,
  cause: unknown,
): Promise<Routed> {
  const detail = cause instanceof Error ? cause.message : String(cause);

  return ports.store.transaction(async (tx) => {
    await failed(ports, tx, record, {
      code: DELIVERY_FAILURE.unknown,
      detail,
    });

    return refused<RoutingRecord, DeliveryRefusal>({
      kind: DELIVERY_FAILURE.unknown,
      detail,
    });
  });
}

async function trace(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  outcome: DeliveryOutcome,
  landed: Landed | undefined,
): Promise<void> {
  if (outcome.kind !== "delivered") {
    await failed(ports, tx, record, {
      code:
        outcome.kind === "unreachable"
          ? DELIVERY_FAILURE.unreachable
          : DELIVERY_FAILURE.rejected,
      detail: outcome.detail,
    });
    return;
  }

  const target = record.target;
  await recordAction(ports, tx, {
    kind: "routed",
    subject: record.item,
    by: { kind: "person" },
    at: record.at,
    detail: {
      record: record.id,
      target: target.kind,
      ...destinationDetail(record),
      ...(outcome.pointer === undefined ? {} : { pointer: outcome.pointer }),
      // The delivery landed and its evidence did not: said here, because the
      // record has no field for an output it does not carry.
      ...(landed?.outputLost === undefined
        ? {}
        : { outputLost: landed.outputLost }),
    },
  });
}

function failed(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  failure: FailureDetail,
): Promise<void> {
  return recordAction(ports, tx, {
    kind: "delivery-failed",
    subject: record.item,
    by: { kind: "person" },
    at: record.at,
    detail: {
      record: record.id,
      ...destinationDetail(record),
      attempt: 1,
      failure,
    },
  });
}

async function deliver(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  landing: DeliveryLanding,
): Promise<Routed> {
  const delivered: RoutingRecord = {
    ...record,
    state: "delivered",
    ...landing,
  };

  await tx.insertRoutingRecord(delivered);
  await enqueueMirrorWrite(
    ports,
    tx,
    { kind: "item", item: record.item },
    record.at,
  );

  return ok(delivered);
}

/**
 * `unreachable` is proof that nothing was delivered, so a job may retry without
 * duplicating. The mirror is owed nothing yet: a reservation is not durable state.
 */
async function reserve(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
): Promise<Routed> {
  await tx.insertRoutingRecord(record);
  await tx.enqueue([
    {
      id: ports.ids.next<JobId>(),
      kind: "delivery",
      subject: { kind: "routing-record", record: record.id },
      // The inline attempt was the first, so the job's numbering carries on
      // from it and `maxAttempts` bounds the destination's total handling.
      attempt: 1,
      enqueuedAt: record.at,
    },
  ]);

  return ok(record);
}

/**
 * The item returns to the queue at its unchanged content time. Routing it again
 * is what a retry by hand is, so there is no operation for one.
 */
export function cancelDelivery(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Result<void, CancelRefusal>> {
  return ports.store.transaction(async (tx) => {
    const record = await tx.routingRecord(id);
    if (record === undefined) {
      return refused({ kind: "no-such-record", record: id });
    }
    if (record.state !== "pending") {
      return refused({ kind: "not-pending", record: id });
    }

    const withdrawal = await tx.withdrawWork({
      kind: "routing-record",
      record: id,
    });
    if (withdrawal === "held") {
      return refused({ kind: "delivery-in-flight", record: id });
    }

    await tx.removeRoutingRecord(id);
    await appendCancelled(ports, tx, record.item, id, ports.clock.now());

    return ok<void, CancelRefusal>(undefined);
  });
}

function appendCancelled(
  ports: PoolPorts,
  tx: PoolTx,
  item: ItemId,
  record: RoutingRecordId,
  at: Timestamp,
): Promise<void> {
  return recordAction(ports, tx, {
    kind: "delivery-cancelled",
    subject: item,
    by: { kind: "person" },
    at,
    detail: { record },
  });
}
