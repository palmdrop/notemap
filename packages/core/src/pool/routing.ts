import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { ok, refused } from "../utils/result";
import type { PoolPorts } from "../types/api/ports";
import type { RoutingRefusal } from "../types/api/refusal";
import type { ItemId, RoutingRecordId } from "../types/domain/ids";
import type { RoutingRecord } from "../types/domain/routing";
import type { Result } from "../types/result";

/**
 * Routing whose destination is the user: they carried the content onward
 * themselves. There is nothing to reach and nothing to be unreachable, so the
 * record is born delivered and no delivery is attempted.
 */
export function markProcessed(
  ports: PoolPorts,
  id: ItemId,
  note?: string,
): Promise<Result<RoutingRecord, RoutingRefusal>> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    const at = ports.clock.now();
    const record: RoutingRecord = {
      id: ports.ids.next<RoutingRecordId>(),
      item: id,
      target: { kind: "user", ...(note === undefined ? {} : { note }) },
      at,
    };

    await tx.insertRoutingRecord(record);
    await enqueueMirrorWrite(ports, tx, id, at);
    await recordAction(ports, tx, {
      kind: "routed",
      subject: id,
      by: { kind: "person" },
      at,
      detail: { record: record.id, target: record.target.kind },
    });

    return ok(record);
  });
}

export function recordsFor(
  ports: PoolPorts,
  id: ItemId,
): Promise<readonly RoutingRecord[]> {
  return ports.store.routingRecords(id);
}
