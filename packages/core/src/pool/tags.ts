import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { ok, refused } from "#utils/result";
import type { PoolPorts } from "#types/api/ports";
import type { TagRefusal } from "#types/api/refusal";
import type { Agent } from "#types/domain/agent";
import type { ItemId, TagName } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Result } from "#types/result";

type TagResult = Result<Item, TagRefusal>;

/**
 * Trimmed here rather than at a caller, because absorbing a tag the item already
 * carries is a comparison against what is stored: normalise anywhere else and
 * `" kind/quote"` writes a second tag beside `"kind/quote"`.
 */
export function normalised(name: TagName): TagName | undefined {
  const trimmed = name.trim() as TagName;
  return trimmed === "" ? undefined : trimmed;
}

/** `content_updated_at` is untouched, so a tagged item keeps its place in the queue. */
export async function tag(
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
  by: Agent,
): Promise<TagResult> {
  const tag = normalised(name);
  if (tag === undefined) return refused({ kind: "tag-invalid", tag: name });

  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    // The first attribution stands, and nothing changed to log or to mirror.
    if (item.tags.some((held) => held.name === tag)) return ok(item);

    const at = ports.clock.now();
    const tagged = await tx.addTag(id, { name: tag, by, addedAt: at });

    await enqueueMirrorWrite(ports, tx, { kind: "item", item: id }, at);
    await recordAction(ports, tx, {
      kind: "tagged",
      subject: id,
      by,
      at,
      detail: { tag },
    });

    return ok(tagged);
  });
}

export async function untag(
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
  by: Agent,
): Promise<TagResult> {
  const tag = normalised(name);
  if (tag === undefined) return refused({ kind: "tag-invalid", tag: name });

  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    if (!item.tags.some((held) => held.name === tag)) return ok(item);

    const at = ports.clock.now();
    const untagged = await tx.removeTag(id, tag);

    await enqueueMirrorWrite(ports, tx, { kind: "item", item: id }, at);
    await recordAction(ports, tx, {
      kind: "untagged",
      subject: id,
      by,
      at,
      detail: { tag },
    });

    return ok(untagged);
  });
}
