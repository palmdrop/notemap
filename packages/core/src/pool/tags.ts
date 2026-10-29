import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { alreadyApplied, fire, firingFor } from "./templates/fire";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { Tagging } from "#types/api/pool";
import type { PoolPorts, PoolReads, PoolTx } from "#types/api/ports";
import type { TagRefusal } from "#types/api/refusal";
import type { Agent } from "#types/domain/agent";
import type { ItemId, TagName } from "#types/domain/ids";
import type { Item, Tag } from "#types/domain/item";
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

/** Of these tags, the ones a template declares: the trigger tags, and not merely the namespace. */
export async function triggersAmong(
  reads: PoolReads,
  tags: readonly Tag[],
): Promise<TagName[]> {
  const triggers: TagName[] = [];
  for (const held of tags) {
    if (!held.name.startsWith(TRIGGER_TAG_NAMESPACE)) continue;
    if ((await reads.routingTemplateByTriggerTag(held.name)) !== undefined) {
      triggers.push(held.name);
    }
  }
  return triggers;
}

/**
 * `content_updated_at` is untouched, so a tagged item keeps its place in the
 * queue — unless a template fires, which takes it out of the queue by reserving.
 *
 * Firing is on the **tagging**: the work is done here and nowhere else, so an
 * absorbed re-tag fires nothing, and a tag drained from an outbox fires by
 * arriving on this path like any other.
 */
export async function tag(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  name: TagName,
  by: Agent,
  options: Tagging = {},
): Promise<TagResult> {
  const tag = normalised(name);
  if (tag === undefined) return refused({ kind: "tag-invalid", tag: name });

  // Once, with the firing skipped where the decision stands; again with it
  // worked out if that decision was withdrawn before the transaction looked.
  for (let firingRequired = false; ; firingRequired = true) {
    const result = await tagOnce(
      config,
      ports,
      id,
      tag,
      by,
      options,
      firingRequired,
    );
    if (result !== undefined) return result;
  }
}

/** `undefined` when the decision that let the firing be skipped is gone. */
async function tagOnce(
  config: PoolConfig,
  ports: PoolPorts,
  id: ItemId,
  tag: TagName,
  by: Agent,
  options: Tagging,
  firingRequired: boolean,
): Promise<TagResult | undefined> {
  const trigger = await triggerFor(
    config,
    ports,
    id,
    tag,
    options,
    firingRequired,
  );
  if (trigger?.firing?.kind === "refused") {
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

    // A decision this template already made stands, so the tag is classification
    // and nothing more: it was spent on the copy that is already there, and
    // firing again would file a second one.
    const decided =
      trigger !== undefined &&
      (await alreadyApplied(tx, id, trigger.template.id)) !== undefined;

    // The decision was withdrawn after the firing was skipped, so a tag written
    // now would be applied with no record behind it. Nothing is written yet.
    if (trigger !== undefined && trigger.firing === undefined && !decided) {
      return undefined;
    }

    const at = ports.clock.now();
    const tagged = await tx.addTag(id, { name: tag, by, addedAt: at });

    let answer = tagged;
    if (trigger?.firing?.kind === "fires" && !decided) {
      await fire(
        config,
        ports,
        tx,
        trigger.firing.record,
        tag,
        trigger.template,
      );
      // Read again, so the answer carries the reservation `addTag` came back without.
      answer = (await tx.item(id)) ?? tagged;
    }

    await enqueueMirrorWrite(ports, tx, { kind: "item", item: id }, at);
    await recordAction(ports, tx, {
      kind: "tagged",
      subject: id,
      by,
      at,
      detail: { tag },
    });

    return ok(answer);
  });
}

/**
 * A trigger tag that filed the item is **not the person's to take off** while
 * what it filed still stands. It is one keystroke away from every ordinary tag
 * in the same chooser, and taking it and putting it back would file a second
 * copy rather than undo the first. The way back from a decision is to cancel
 * it, which removes the reservation and gives the tag with it.
 */
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

    const held = await filed(tx, id, tag);
    if (held !== undefined) return refused(held);

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
 * What this tag filed that has not been called off, where the tag is a trigger
 * at all. An ordinary tag costs no read: nothing outside the namespace can have
 * filed anything.
 */
async function filed(
  tx: PoolTx,
  id: ItemId,
  tag: TagName,
): Promise<TagRefusal | undefined> {
  if (!tag.startsWith(TRIGGER_TAG_NAMESPACE)) return undefined;

  const template = await tx.routingTemplateByTriggerTag(tag);
  if (template === undefined) return undefined;

  const record = await alreadyApplied(tx, id, template.id);
  if (record === undefined) return undefined;

  return {
    kind: "trigger-tag-held",
    tag,
    template: template.id,
    record: record.id,
  };
}

/**
 * What this tag would fire, worked out before the transaction opens. Nothing
 * outside the reserved namespace can claim a template, so an ordinary tag costs
 * no read at all.
 *
 * Without a `firing` the template had already decided this item when it was
 * read; the transaction confirms that, and `tag` goes round again with the
 * firing worked out if the decision has been withdrawn since.
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
  options: Tagging,
  firingRequired: boolean,
): Promise<{ template: RoutingTemplate; firing?: Firing } | undefined> {
  if (!tag.startsWith(TRIGGER_TAG_NAMESPACE)) return undefined;

  const template = await ports.store.routingTemplateByTriggerTag(tag);
  if (template === undefined) return undefined;

  const item = await ports.store.item(id);
  if (item === undefined) return undefined;
  if (item.tags.some((held) => held.name === tag)) return undefined;

  // Asked arguments are needed only to fire. Where the template has already
  // decided this item nothing fires, so the tag must not be refused for them.
  // The check is repeated inside the transaction, which is what decides.
  if (
    !firingRequired &&
    (await alreadyApplied(ports.store, id, template.id)) !== undefined
  ) {
    return { template };
  }

  return {
    template,
    firing: await firingFor(
      config,
      ports,
      item,
      template,
      options.arguments,
      options.signal,
    ),
  };
}
