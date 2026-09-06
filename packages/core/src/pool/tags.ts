import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { fire, firingFor } from "./templates/fire";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { TagRefusal } from "#types/api/refusal";
import type { Agent } from "#types/domain/agent";
import type { ItemId, TagName } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import { TRIGGER_TAG_NAMESPACE } from "#types/domain/template";
import type { RoutingTemplate } from "#types/domain/template";
import type { Result } from "#types/result";
import type { Firing } from "./templates/fire";

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

/**
 * `content_updated_at` is untouched, so a tagged item keeps its place in the
 * queue — unless a template fires, which takes it out of the queue by reserving.
 *
 * Firing is on the **tagging**: the work is done here and nowhere else, so an
 * absorbed re-tag fires nothing, a revision carrying the tag fires nothing, and
 * a tag drained from an outbox fires by arriving on this path like any other.
 */
export async function tag(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
  by: Agent,
  signal?: AbortSignal,
): Promise<TagResult> {
  const tag = normalised(name);
  if (tag === undefined) return refused({ kind: "tag-invalid", tag: name });

  const trigger = await triggerFor(config, ports, id, tag, signal);
  if (trigger?.firing.kind === "refused") {
    return refused({
      kind: "trigger-refused",
      tag,
      template: trigger.template.id,
      detail: trigger.firing.detail,
    });
  }

  return ports.store.transaction(async (tx) => {
    const item = await tx.item(id);
    if (item === undefined) return refused({ kind: "no-such-item", item: id });

    // The first attribution stands, and nothing changed to log or to mirror.
    if (item.tags.some((held) => held.name === tag)) return ok(item);

    const at = ports.clock.now();
    const tagged = await tx.addTag(id, { name: tag, by, addedAt: at });

    if (trigger?.firing.kind === "fires") {
      await fire(
        config,
        ports,
        tx,
        trigger.firing.record,
        tag,
        trigger.template,
      );
    }

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

/**
 * What this tag would fire, worked out before the transaction opens. Nothing
 * outside the reserved namespace can claim a template, so an ordinary tag costs
 * no read at all.
 *
 * The item is read twice — here and again inside the transaction — and only the
 * second reading decides. This one is for the expansion, which needs the
 * capture; a tag that arrives in between is absorbed there, and the reservation
 * worked out here is simply dropped.
 */
async function triggerFor(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  tag: TagName,
  signal?: AbortSignal,
): Promise<{ template: RoutingTemplate; firing: Firing } | undefined> {
  if (!tag.startsWith(TRIGGER_TAG_NAMESPACE)) return undefined;

  const template = await ports.store.routingTemplateByTriggerTag(tag);
  if (template === undefined) return undefined;

  const item = await ports.store.item(id);
  if (item === undefined) return undefined;
  if (item.tags.some((held) => held.name === tag)) return undefined;

  return {
    template,
    firing: await firingFor(config, ports, item, template, signal),
  };
}
