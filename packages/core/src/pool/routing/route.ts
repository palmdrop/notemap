import { recordAction } from "../actions";
import { enqueueMirrorWrite } from "../mirror";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { CancelRefusal, DeliveryRefusal } from "#types/api/refusal";
import type { Item } from "#types/domain/item";
import type {
  ItemId,
  JobId,
  RoutingRecordId,
  TagName,
  Timestamp,
} from "#types/domain/ids";
import type {
  AppliedTemplate,
  DeliveryRequest,
  RoutedRecord,
  RoutingRecord,
} from "#types/domain/routing";
import type { Result } from "#types/result";
import { later } from "#utils/time";
import { destinationDetail, templateDetail } from "./delivery";
import { releaseTriggerTag } from "../templates/fire";
import { checkFor } from "./prepare";

type Routed = Result<RoutedRecord, DeliveryRefusal>;

/**
 * The decision, and nothing attempted: the delivery is a job due the undo
 * window later, so cancelling inside it is a true cancel against a vault that
 * is mounted. Everything checkable is checked first, while the person is still
 * looking at the item.
 */
export async function route(
  config: PoolConfig,
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
  /** Where the decision came from a template, which the record carries. */
  applied?: AppliedTemplate,
): Promise<Routed> {
  const stored = await ports.store.item(item);
  if (stored === undefined) return refused({ kind: "no-such-item", item });

  const checked = await checkFor(config, ports, stored, request, signal);
  // A record minted here would carry arguments nobody validated.
  if (checked.kind === "refused") return refused(checked.refusal);

  const record: RoutingRecord = {
    id: ports.ids.next<RoutingRecordId>(),
    item,
    target: {
      kind: "destination",
      destination: request.destination,
      capability: request.capability,
      arguments: request.arguments,
      // Held so the delivery replays the words the decision was made with,
      // on the arguments' own terms.
      ...(request.content === undefined ? {} : { content: request.content }),
    },
    state: "pending",
    at: ports.clock.now(),
    ...(applied === undefined ? {} : { applied }),
  };
  const until = later(record.at, config.undoWindow);

  return ports.store.transaction(async (tx) => {
    if ((await tx.item(item)) === undefined) {
      return refused<RoutedRecord, DeliveryRefusal>({
        kind: "no-such-item",
        item,
      });
    }

    await tx.insertRoutingRecord(record);
    await tx.enqueue([
      {
        id: ports.ids.next<JobId>(),
        kind: "delivery",
        subject: { kind: "routing-record", record: record.id },
        attempt: 0,
        enqueuedAt: record.at,
        notBefore: until,
      },
    ]);
    await recordAction(ports, tx, {
      kind: "delivery-held",
      subject: item,
      by: { kind: "person" },
      at: record.at,
      detail: {
        record: record.id,
        target: record.target.kind,
        ...destinationDetail(record),
        ...templateDetail(record),
        until,
      },
    });

    return ok<RoutedRecord, DeliveryRefusal>({ ...record, until });
  });
}

/**
 * The item returns to the queue at its unchanged content time. Routing it again
 * is what a retry by hand is, so there is no operation for one.
 *
 * A record naming the person is born delivered and is still taken back here:
 * nothing reached anywhere, so there is nothing that already happened. It was
 * mirrored, though, which a reservation never is, so the mirror is owed the item.
 */
export function cancelDelivery(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Result<Item, CancelRefusal>> {
  return ports.store.transaction(async (tx) => {
    const record = await tx.routingRecord(id);
    if (record === undefined) {
      return refused({ kind: "no-such-record", record: id });
    }

    const byHand = record.target.kind === "user";
    if (!byHand && record.state !== "pending") {
      return refused({ kind: "not-pending", record: id });
    }

    const withdrawal = await tx.withdrawWork({
      kind: "routing-record",
      record: id,
    });
    if (withdrawal === "held") {
      return refused({ kind: "delivery-in-flight", record: id });
    }

    const at = ports.clock.now();
    await tx.removeRoutingRecord(id);
    const gave = await releaseTriggerTag(ports, tx, record, at, "person");
    await appendCancelled(ports, tx, record, at, gave);
    if (byHand) {
      await enqueueMirrorWrite(
        ports,
        tx,
        { kind: "item", item: record.item },
        at,
      );
    }

    const item = await tx.item(record.item);
    if (item === undefined) {
      return refused({ kind: "no-such-record", record: id });
    }
    return ok(item);
  });
}

function appendCancelled(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  at: Timestamp,
  /** The trigger tag that came off with it, where the reservation was a tag's. */
  gave: TagName | undefined,
): Promise<void> {
  return recordAction(ports, tx, {
    kind: "delivery-cancelled",
    subject: record.item,
    by: { kind: "person" },
    at,
    detail: {
      record: record.id,
      target: record.target.kind,
      // The record is gone with this entry, which is all a shell has left to name where it was going.
      ...destinationDetail(record),
      // Which template this called off, so a shell saying one is on its way
      // knows this is the entry that ends it.
      ...templateDetail(record),
      ...(gave === undefined ? {} : { tag: gave }),
    },
  });
}
