import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { ok, refused } from "../utils/result";
import type { PoolPorts } from "../types/api/ports";
import type { TagRefusal } from "../types/api/refusal";
import type { Agent } from "../types/domain/agent";
import type { ItemId, TagName } from "../types/domain/ids";
import type { Item } from "../types/domain/item";
import type { Result } from "../types/result";

type TagResult = Result<Item, TagRefusal>;

/**
 * Classification never moves an item: `content_updated_at` is untouched, so a
 * tagged item keeps its place in the queue rather than resurfacing.
 */
export function tag(
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
  by: Agent,
): Promise<TagResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    // The item already says this, so the first attribution stands and there is
    // no change to log or to mirror.
    if (item.tags.some((held) => held.name === name)) return ok(item);

    const at = ports.clock.now();
    const tagged = await tx.addTag(id, { name, by, addedAt: at });

    await enqueueMirrorWrite(ports, tx, id, at);
    await recordAction(ports, tx, {
      kind: "tagged",
      subject: id,
      by,
      at,
      detail: { tag: name },
    });

    return ok(tagged);
  });
}

export function untag(
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
): Promise<TagResult> {
  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });
    if (!item.tags.some((held) => held.name === name)) return ok(item);

    const at = ports.clock.now();
    const untagged = await tx.removeTag(id, name);

    await enqueueMirrorWrite(ports, tx, id, at);
    await recordAction(ports, tx, {
      kind: "untagged",
      subject: id,
      // A tag names the agent that added it; removing one is always a person's.
      by: { kind: "person" },
      at,
      detail: { tag: name },
    });

    return ok(untagged);
  });
}
