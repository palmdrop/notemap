import { recordAction } from "../actions";
import { usability } from "../destinations/usability";
import { enqueueMirrorWrite } from "../mirror";
import { ok, refused } from "../../utils/result";
import type { PoolPorts, PoolTx } from "../../types/api/ports";
import type { CancelRefusal, DeliveryRefusal } from "../../types/api/refusal";
import type {
  Destination,
  DestinationDescriptor,
} from "../../types/domain/destination";
import type { FailureDetail } from "../../types/domain/enrichment";
import type {
  ItemId,
  JobId,
  RoutingRecordId,
  Timestamp,
} from "../../types/domain/ids";
import type {
  DeliveryOutcome,
  DeliveryRequest,
  RoutingRecord,
} from "../../types/domain/routing";
import type { Result } from "../../types/result";
import {
  DELIVERY_FAILURE,
  destinationDetail,
  projectDelivery,
} from "./delivery";

type Routed = Result<RoutingRecord, DeliveryRefusal>;

/**
 * Everything checkable is checked before anything is written or attempted,
 * because this is interactive: a typo'd target is worth refusing while the
 * person is still looking at the item. The adapter is then called outside any
 * transaction.
 */
export async function route(
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Routed> {
  const destination = await ports.store.destination(request.destination);
  if (destination === undefined) {
    return refused({
      kind: "unknown-destination",
      destination: request.destination,
    });
  }
  if (destination.retiredAt !== undefined) {
    return refused({
      kind: "destination-retired",
      destination: destination.id,
    });
  }

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return refused({
      kind: "destination-unusable",
      destination: destination.id,
      detail: usable.detail,
    });
  }

  const described = await describeOrRefuse(ports, destination, signal);
  if (described.kind === "refused") return described;

  const capability = described.value.capabilities.find(
    (each) => each.name === request.capability,
  );
  if (capability === undefined) {
    return refused({
      kind: "capability-undeclared",
      capability: request.capability,
    });
  }

  const stored = await ports.store.item(item);
  if (stored === undefined) return refused({ kind: "no-such-item", item });

  if (!capability.accepts.includes(stored.payload.type)) {
    return refused({
      kind: "payload-type-unsupported",
      type: stored.payload.type,
      accepts: capability.accepts,
    });
  }

  const issues = ports.schemas.validate(
    capability.targetSchema,
    request.target,
  );
  if (issues.length > 0) return refused({ kind: "target-invalid", issues });

  const delivery = await projectDelivery(ports, stored, request);
  const record: RoutingRecord = {
    id: ports.ids.next<RoutingRecordId>(),
    item,
    target: {
      kind: "destination",
      destination: request.destination,
      capability: request.capability,
      target: request.target,
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

  return ports.store.transaction(async (tx) => {
    // Purged while the adapter had the bytes: the record dies with the item,
    // but the entry saying bytes left the machine outlives it.
    const present = (await tx.item(item)) !== undefined;

    await trace(ports, tx, record, outcome);
    if (!present) {
      return refused<RoutingRecord, DeliveryRefusal>({
        kind: "item-purged",
        item,
        at: record.at,
      });
    }

    switch (outcome.kind) {
      case "delivered":
        return deliver(ports, tx, record, outcome.pointer);
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
 * A destination that cannot say what it accepts cannot have a target checked
 * against it. Nothing has been attempted and nothing written, so this refuses
 * rather than reserving: a record minted here would carry a target nobody
 * validated, and every retry would refuse it again.
 */
async function describeOrRefuse(
  ports: PoolPorts,
  destination: Destination,
  signal?: AbortSignal,
): Promise<Result<DestinationDescriptor, DeliveryRefusal>> {
  try {
    return ok(await ports.destinations.describe(destination, signal));
  } catch (cause) {
    return refused({
      kind: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
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
  pointer: string | undefined,
): Promise<Routed> {
  const delivered: RoutingRecord = {
    ...record,
    state: "delivered",
    ...(pointer === undefined ? {} : { pointer }),
  };

  await tx.insertRoutingRecord(delivered);
  await enqueueMirrorWrite(ports, tx, record.item, record.at);

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
