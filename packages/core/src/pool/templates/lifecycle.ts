import { recordAction } from "../actions";
import { enqueueMirrorRemove, enqueueMirrorWrite } from "../mirror";
import { normalised } from "../tags";
import { sameJson } from "#utils/json";
import { ok, refused } from "#utils/result";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { RoutingTemplateRefusal } from "#types/api/refusal";
import type { ActionKind } from "#types/domain/action-log";
import type { RoutingTemplateId, TagName, Timestamp } from "#types/domain/ids";
import type {
  RoutingTemplate,
  RoutingTemplateChanges,
  RoutingTemplateDraft,
  RoutingTemplateRecord,
} from "#types/domain/template";
import { TRIGGER_TAG_NAMESPACE } from "#types/domain/template";
import type { JsonObject } from "#types/json";
import type { Result } from "#types/result";

type Written = Result<RoutingTemplate, RoutingTemplateRefusal>;

export function list(ports: PoolPorts): Promise<readonly RoutingTemplate[]> {
  return ports.store.routingTemplates();
}

export function read(
  ports: PoolPorts,
  id: RoutingTemplateId,
): Promise<RoutingTemplate | undefined> {
  return ports.store.routingTemplate(id);
}

export function create(
  ports: PoolPorts,
  draft: RoutingTemplateDraft,
): Promise<Written> {
  return ports.store.transaction(async (tx) => {
    if ((await tx.destination(draft.destination)) === undefined) {
      return refused<RoutingTemplate, RoutingTemplateRefusal>({
        kind: "unknown-destination",
        destination: draft.destination,
      });
    }

    const trigger = await triggerTag(tx, draft.triggerTag, undefined);
    if (trigger.kind === "refused") return trigger;

    const at = ports.clock.now();
    const record: RoutingTemplateRecord = {
      id: ports.ids.next<RoutingTemplateId>(),
      name: draft.name,
      destination: draft.destination,
      capability: draft.capability,
      arguments: draft.arguments,
      folder: draft.folder ?? "create",
      ...(trigger.value === undefined ? {} : { triggerTag: trigger.value }),
      createdAt: at,
    };

    const stored = await tx.insertRoutingTemplate(record);
    await changed(ports, tx, "template-created", stored, at, {
      name: stored.name,
      destination: stored.destination,
      capability: stored.capability,
      ...(stored.triggerTag === undefined ? {} : { tag: stored.triggerTag }),
    });

    return ok<RoutingTemplate, RoutingTemplateRefusal>(stored);
  });
}

export function edit(
  ports: PoolPorts,
  id: RoutingTemplateId,
  changes: RoutingTemplateChanges,
): Promise<Written> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.routingTemplate(id);
    if (held === undefined) {
      return refused<RoutingTemplate, RoutingTemplateRefusal>({
        kind: "unknown-template",
        template: id,
      });
    }

    if (
      changes.destination !== undefined &&
      changes.destination !== held.destination &&
      (await tx.destination(changes.destination)) === undefined
    ) {
      return refused<RoutingTemplate, RoutingTemplateRefusal>({
        kind: "unknown-destination",
        destination: changes.destination,
      });
    }

    const trigger =
      changes.triggerTag === undefined
        ? ok<TagName | undefined, RoutingTemplateRefusal>(held.triggerTag)
        : changes.triggerTag === null
          ? ok<TagName | undefined, RoutingTemplateRefusal>(undefined)
          : await triggerTag(tx, changes.triggerTag, id);
    if (trigger.kind === "refused") return trigger;

    const wanted: RoutingTemplateRecord = {
      ...record(held),
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.destination === undefined
        ? {}
        : { destination: changes.destination }),
      ...(changes.capability === undefined
        ? {}
        : { capability: changes.capability }),
      ...(changes.arguments === undefined
        ? {}
        : { arguments: changes.arguments }),
      ...(changes.folder === undefined ? {} : { folder: changes.folder }),
    };
    const { triggerTag: _held, ...without } = wanted;
    const next: RoutingTemplateRecord =
      trigger.value === undefined
        ? without
        : { ...without, triggerTag: trigger.value };

    if (unchanged(held, next)) {
      return ok<RoutingTemplate, RoutingTemplateRefusal>(held);
    }

    const at = ports.clock.now();
    const stored = await tx.updateRoutingTemplate(next);
    await changed(ports, tx, "template-edited", stored, at, {
      name: stored.name,
      destination: stored.destination,
      capability: stored.capability,
      ...(stored.triggerTag === undefined ? {} : { tag: stored.triggerTag }),
    });

    return ok<RoutingTemplate, RoutingTemplateRefusal>(stored);
  });
}

/**
 * Deleted rather than retired: a destination is retired because records name it
 * forever, and a template names nothing that outlives it. A record made from one
 * carries what it routed as and keeps resolving without it.
 */
export function remove(
  ports: PoolPorts,
  id: RoutingTemplateId,
): Promise<Result<void, RoutingTemplateRefusal>> {
  return ports.store.transaction(async (tx) => {
    const held = await tx.routingTemplate(id);
    if (held === undefined) {
      return refused<void, RoutingTemplateRefusal>({
        kind: "unknown-template",
        template: id,
      });
    }

    const at = ports.clock.now();
    await tx.deleteRoutingTemplate(id);
    await trace(ports, tx, "template-deleted", held, at, { name: held.name });
    await enqueueMirrorRemove(
      ports,
      tx,
      { kind: "template", template: id },
      at,
    );

    return ok<void, RoutingTemplateRefusal>(undefined);
  });
}

/**
 * Reserved and unique. Reserved so a tag with an effect is recognisable as one
 * without consulting anything; unique because two templates claiming one tag is
 * a decision nobody could read off the item afterwards.
 */
async function triggerTag(
  tx: PoolTx,
  wanted: TagName | undefined,
  own: RoutingTemplateId | undefined,
): Promise<Result<TagName | undefined, RoutingTemplateRefusal>> {
  if (wanted === undefined) {
    return ok<TagName | undefined, RoutingTemplateRefusal>(undefined);
  }

  const tag = normalised(wanted);
  if (tag === undefined) {
    return refused<TagName | undefined, RoutingTemplateRefusal>({
      kind: "trigger-tag-invalid",
      tag: wanted,
    });
  }
  if (!tag.startsWith(TRIGGER_TAG_NAMESPACE) || tag === TRIGGER_TAG_NAMESPACE) {
    return refused<TagName | undefined, RoutingTemplateRefusal>({
      kind: "trigger-tag-unreserved",
      tag,
    });
  }

  const claimed = await tx.routingTemplateByTriggerTag(tag);
  if (claimed !== undefined && claimed.id !== own) {
    return refused<TagName | undefined, RoutingTemplateRefusal>({
      kind: "trigger-tag-taken",
      tag,
      template: claimed.id,
    });
  }

  return ok<TagName | undefined, RoutingTemplateRefusal>(tag);
}

function unchanged(
  held: RoutingTemplate,
  next: RoutingTemplateRecord,
): boolean {
  return (
    held.name === next.name &&
    held.destination === next.destination &&
    held.capability === next.capability &&
    held.folder === next.folder &&
    held.triggerTag === next.triggerTag &&
    sameJson(held.arguments, next.arguments)
  );
}

/** Every field the store writes, taken off what it last answered with. */
function record(held: RoutingTemplate): RoutingTemplateRecord {
  const { modifiedAt: _modified, ...fields } = held;
  return fields;
}

async function changed(
  ports: PoolPorts,
  tx: PoolTx,
  kind: ActionKind,
  template: RoutingTemplate,
  at: Timestamp,
  detail: JsonObject,
): Promise<void> {
  await trace(ports, tx, kind, template, at, detail);
  await enqueueMirrorWrite(
    ports,
    tx,
    { kind: "template", template: template.id },
    at,
  );
}

/** A template is not an item, so an entry names it in its detail rather than as its subject. */
function trace(
  ports: PoolPorts,
  tx: PoolTx,
  kind: ActionKind,
  template: RoutingTemplate,
  at: Timestamp,
  detail: JsonObject,
): Promise<void> {
  return recordAction(ports, tx, {
    kind,
    by: { kind: "person" },
    at,
    detail: { template: template.id, ...detail },
  });
}
