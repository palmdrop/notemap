import { recordAction } from "../actions";
import { enqueueMirrorWrite } from "../mirror";
import { ok, refused } from "../../utils/result";
import type { PoolPorts, PoolTx } from "../../types/api/ports";
import type { DeliveryRefusal } from "../../types/api/refusal";
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
import { DELIVERY_FAILURE, projectDelivery } from "./delivery";
import type { DestinationIndex } from "./destinations";

type Routed = Result<RoutingRecord, DeliveryRefusal>;

/**
 * A person's decision, and one attempt to carry it out.
 *
 * Everything that can be checked is checked before anything is written or
 * attempted, because this is interactive: a typo'd target is worth refusing
 * while the person is still looking at the item. Then the adapter is called
 * **outside any transaction**, and what it answered decides what is written —
 * delivered resolves it, a refusal leaves nothing behind, and a destination
 * that was never reached leaves a reservation and a job.
 */
export async function route(
  ports: PoolPorts,
  destinations: DestinationIndex,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Routed> {
  const wired = destinations.get(request.destination);
  if (wired === undefined) {
    return refused({
      kind: "unknown-destination",
      destination: request.destination,
    });
  }

  const capability = wired.descriptor.capabilities.find(
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

  const outcome = await wired.adapter.deliver(delivery, signal);

  return ports.store.transaction(async (tx) => {
    // The item may have been purged while the adapter had the bytes. The
    // record is item state and dies with the item; the entry saying bytes left
    // the machine is a trace, and the log outlives what it describes.
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

/** What happened, whether or not there is state left to record it against. */
async function trace(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  outcome: DeliveryOutcome,
): Promise<void> {
  const target = record.target;
  const where =
    target.kind === "destination"
      ? { destination: target.destination, capability: target.capability }
      : {};

  if (outcome.kind === "delivered") {
    await recordAction(ports, tx, {
      kind: "routed",
      subject: record.item,
      // Nothing but a person routes, so there is no attribution to take.
      by: { kind: "person" },
      at: record.at,
      detail: {
        record: record.id,
        target: target.kind,
        ...where,
        ...(outcome.pointer === undefined ? {} : { pointer: outcome.pointer }),
      },
    });
    return;
  }

  await recordAction(ports, tx, {
    kind: "delivery-failed",
    subject: record.item,
    by: { kind: "person" },
    at: record.at,
    detail: {
      record: record.id,
      ...where,
      attempt: 1,
      failure: {
        code:
          outcome.kind === "unreachable"
            ? DELIVERY_FAILURE.unreachable
            : DELIVERY_FAILURE.rejected,
        detail: outcome.detail,
      },
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
 * The decision stands although nothing arrived: `unreachable` is proof that
 * nothing was delivered, so a job may retry it without duplicating. The mirror
 * is owed nothing yet — a reservation is not durable state.
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
      attempt: 0,
      enqueuedAt: record.at,
    },
  ]);

  return ok(record);
}

/**
 * Calling off a delivery that has not landed. The reservation is removed and
 * the item returns to the queue at its unchanged content time — routing it
 * again is what a retry by hand is, so there is no operation for one.
 */
export function cancelDelivery(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Result<void, DeliveryRefusal>> {
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

    return ok<void, DeliveryRefusal>(undefined);
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
