import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { ok, refused } from "../utils/result";
import type { PoolPorts } from "../types/api/ports";
import type { ArchiveRefusal } from "../types/api/refusal";
import type { ItemId } from "../types/domain/ids";
import type { Item } from "../types/domain/item";
import type { Result } from "../types/result";

type ArchiveResult = Result<Item, ArchiveRefusal>;

export function archive(
  ports: PoolPorts,
  id: ItemId,
  reason?: string,
): Promise<ArchiveResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });
    if (item.archived !== undefined) {
      return refused({
        kind: "already-archived",
        item: id,
        at: item.archived.archivedAt,
      });
    }

    const at = ports.clock.now();
    const archived = await tx.setArchiveState(id, {
      archivedAt: at,
      ...(reason === undefined ? {} : { reason }),
    });

    await enqueueMirrorWrite(ports, tx, id, at);
    await recordAction(ports, tx, {
      kind: "archived",
      subject: id,
      // Nothing but a person archives, so there is no attribution to take.
      by: { kind: "person" },
      at,
      detail: reason === undefined ? {} : { reason },
    });

    return ok(archived);
  });
}

export function unarchive(
  ports: PoolPorts,
  id: ItemId,
): Promise<ArchiveResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });
    if (item.archived === undefined) {
      return refused({ kind: "not-archived", item: id });
    }

    const at = ports.clock.now();
    // The content time is untouched, which is what returns the item to the
    // queue at the position it left from.
    const restored = await tx.setArchiveState(id);

    await enqueueMirrorWrite(ports, tx, id, at);
    await recordAction(ports, tx, {
      kind: "unarchived",
      subject: id,
      by: { kind: "person" },
      at,
      detail: {},
    });

    return ok(restored);
  });
}
