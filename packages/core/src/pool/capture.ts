import { dequal } from "dequal";

import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { headOf, lineSourceOf } from "./lines";
import {
  canonicalPayload,
  checkAssets,
  checkPayload,
  samePayload,
} from "./payload";
import { normalised, triggersAmong } from "./tags";
import { fire, firingFor } from "./templates/fire";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { CaptureRefusal } from "#types/api/refusal";
import type { Agent } from "#types/domain/agent";
import type { CaptureEnvelope, CaptureOutcome } from "#types/domain/capture";
import type { ItemId, TagName } from "#types/domain/ids";
import type { Item, ItemRecord, Tag } from "#types/domain/item";
import { TRIGGER_TAG_NAMESPACE } from "#types/domain/template";
import type {
  RoutingTemplate,
  SuppliedArguments,
} from "#types/domain/template";
import type { RoutingRecord } from "#types/domain/routing";
import type { Result } from "#types/result";

type CaptureResult = Result<CaptureOutcome, CaptureRefusal>;

export async function capture(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
  signal?: AbortSignal,
): Promise<CaptureResult> {
  const invalid = validate(config, ports, envelope);
  if (invalid !== undefined) return refused(invalid);

  // Minted here rather than in the transaction, because a trigger tag the
  // capture arrives with has to expand `{{item}}` against the item it is about
  // to become. A replay leaves it unused, which costs a number.
  const id = envelope.id ?? ports.ids.next<ItemId>();
  const proposed = recorded(envelope, id);
  // A continuation is a conflict for a person to look at, so nothing it carries
  // files it before they have.
  const { firings, spent } =
    envelope.continues === undefined
      ? await fired(config, ports, proposed, suppliedByTag(envelope), signal)
      : {
          firings: [],
          spent: await triggersAmong(ports.store, proposed.tags),
        };
  const record = without(proposed, spent);

  return ports.store.transaction((tx) =>
    append(config, ports, envelope, record, firings, tx),
  );
}

/**
 * A capture arriving already tagged files itself, which is the whole point of a
 * source being able to decide where its captures go
 * ([ADR 34](../../../../docs/adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)).
 * Worked out before the transaction, for the reason every firing is, and
 * committed with the item so *tagged but not reserved* cannot exist here either.
 *
 * This is the one place a capture reaches the outside world — the destination is
 * asked what it can do — so the caller's signal comes with it: a vault that has
 * stopped answering may not hold the fastest path in the app open.
 *
 * A trigger tag whose template cannot route is **dropped**, rather than the
 * capture being refused as an interactive tag is: a whole capture is not lost
 * over a tag, and there is nobody here to be told. Landing it would be worse
 * than losing it — tagging is idempotent, so a tag that filed nothing could
 * never file this item once the template was fixed.
 */
async function fired(
  config: PoolConfig,
  ports: PoolPorts,
  record: ItemRecord,
  supplied: ReadonlyMap<TagName, SuppliedArguments>,
  signal?: AbortSignal,
): Promise<{ firings: readonly Firing[]; spent: readonly TagName[] }> {
  const triggers = record.tags.filter((held) =>
    held.name.startsWith(TRIGGER_TAG_NAMESPACE),
  );
  if (triggers.length === 0) return { firings: [], spent: [] };

  // What the store will derive for a row that is about to be inserted: nothing
  // has revised it and nothing has changed it since it was written.
  const item: Item = {
    ...record,
    modifiedAt: record.createdAt,
    processedAt: record.createdAt,
    revisedInto: [],
  };
  const firings: Firing[] = [];
  const spent: TagName[] = [];

  for (const held of triggers) {
    const template = await ports.store.routingTemplateByTriggerTag(held.name);
    // Nothing claims it, so it is an ordinary tag that happens to be namespaced.
    if (template === undefined) continue;

    const firing = await firingFor(
      config,
      ports,
      item,
      template,
      supplied.get(held.name),
      signal,
    );
    if (firing.kind === "fires") {
      firings.push({ tag: held.name, template, record: firing.record });
    } else {
      spent.push(held.name);
    }
  }

  return { firings, spent };
}

/** Keyed as the tags are once trimmed, so a value finds the tag it was given with. */
function suppliedByTag(
  envelope: CaptureEnvelope,
): ReadonlyMap<TagName, SuppliedArguments> {
  return new Map(
    Object.entries(envelope.arguments ?? {}).flatMap(([name, values]) => {
      const tag = normalised(name as TagName);
      return tag === undefined ? [] : [[tag, values] as const];
    }),
  );
}

function without(record: ItemRecord, spent: readonly TagName[]): ItemRecord {
  return spent.length === 0
    ? record
    : {
        ...record,
        tags: record.tags.filter((held) => !spent.includes(held.name)),
      };
}

type Firing = {
  readonly tag: TagName;
  readonly template: RoutingTemplate;
  readonly record: RoutingRecord;
};

/** What the envelope says the item is, before the pool has agreed to hold it. */
function recorded(envelope: CaptureEnvelope, id: ItemId): ItemRecord {
  const by: Agent = { kind: "source", source: envelope.source };

  return {
    id,
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    // Dropped rather than refused: a whole capture is not lost over a stray tag.
    tags: (envelope.tags ?? []).flatMap((name): Tag[] => {
      const tag = normalised(name);
      return tag === undefined
        ? []
        : [{ name: tag, by, addedAt: envelope.capturedAt }];
    }),
    createdAt: envelope.capturedAt,
    ...(envelope.utcOffset === undefined
      ? {}
      : { utcOffset: envelope.utcOffset }),
    ...(envelope.continues === undefined
      ? {}
      : { continues: envelope.continues }),
  };
}

/** Everything decidable without reading the pool, so a malformed capture never opens a transaction. */
function validate(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
): CaptureRefusal | undefined {
  // A source is never checked: any id captures, and which sources exist is
  // read back off the items themselves. `unknown-asset` needs the pool, so it
  // is decided inside the transaction.
  return checkPayload(config, ports, envelope.payload);
}

async function append(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
  record: ItemRecord,
  firings: readonly Firing[],
  tx: PoolTx,
): Promise<CaptureResult> {
  if (envelope.id !== undefined) {
    const existing = await tx.item(envelope.id);
    if (existing !== undefined) {
      return isReplayOf(existing, envelope)
        ? ok({ kind: "already-captured", item: existing, matchedOn: "id" })
        : refused({ kind: "capture-id-conflict", existing: existing.id });
    }
  }

  const bySource = await tx.itemBySourceIdentity(
    envelope.source,
    envelope.sourceItemId,
  );
  if (bySource !== undefined) return reread(tx, bySource, envelope);

  if (envelope.continues !== undefined) {
    const continued = await tx.item(envelope.continues);
    if (
      continued === undefined ||
      continued.sourceWord === undefined ||
      (await headOf(tx, continued)).id !== continued.id ||
      (await lineSourceOf(tx, continued)) !== envelope.source
    ) {
      return refused({
        kind: "continues-not-head",
        continues: envelope.continues,
      });
    }
  }

  const unknown = await checkAssets(tx, envelope.payload);
  if (unknown !== undefined) return refused(unknown);

  const by: Agent = { kind: "source", source: envelope.source };
  const item = await tx.insertItem(record);
  const at = ports.clock.now();

  await enqueueMirrorWrite(ports, tx, { kind: "item", item: item.id }, at);

  await recordAction(ports, tx, {
    kind: "captured",
    subject: item.id,
    by,
    at,
    detail: {},
  });

  for (const firing of firings) {
    await fire(config, ports, tx, firing.record, firing.tag, firing.template);
  }

  // Read again, so the answer carries the reservations `insertItem` came back without.
  const answer =
    firings.length === 0 ? item : ((await tx.item(item.id)) ?? item);

  return ok({ kind: "captured", item: answer });
}

/**
 * What a capture fixed, from either side, in one comparable shape.
 *
 * By exclusion rather than enumeration, so a field added to the envelope is
 * compared by default. Tags are dropped because they go on changing after
 * capture, and an item classified since would otherwise read as a conflicting
 * resubmission of itself. The arguments they were given go with them.
 */
type FixedByCapture = Omit<
  CaptureEnvelope,
  "id" | "tags" | "arguments" | "capturedAt"
> & {
  /** As an instant: a timestamp's spelling is not part of what it means. */
  readonly capturedAtMs: number;
};

function isReplayOf(existing: Item, envelope: CaptureEnvelope): boolean {
  return dequal(fixedByItem(existing), fixedByEnvelope(envelope));
}

/**
 * A source re-reading what it captured is answered by the head of its line,
 * which is where every edit since has gone. What the head says and what the
 * source last said are both a replay; anything else is an upstream edit, or a
 * divergence where somebody else has changed the head too.
 *
 * Decided on the payload alone. No edit can change a capture time, so a source
 * told that one had changed would send the same edit on every read.
 */
async function reread(
  tx: PoolTx,
  holder: Item,
  envelope: CaptureEnvelope,
): Promise<CaptureResult> {
  const head = await headOf(tx, holder);
  const said =
    samePayload(head.payload, envelope.payload) ||
    (head.sourceWord !== undefined &&
      samePayload(head.sourceWord, envelope.payload));
  if (said) {
    return ok({ kind: "already-captured", item: head, matchedOn: "source" });
  }

  return refused({
    kind:
      head.sourceWord === undefined
        ? "source-item-changed"
        : "source-item-diverged",
    existing: head.id,
  });
}

function fixedByEnvelope(envelope: CaptureEnvelope): FixedByCapture {
  const { id, tags, arguments: _supplied, capturedAt, ...fixed } = envelope;
  return {
    ...fixed,
    capturedAtMs: Date.parse(capturedAt),
    payload: canonicalPayload(envelope.payload),
  };
}

function fixedByItem(item: Item): FixedByCapture {
  return {
    source: item.source,
    sourceItemId: item.sourceItemId,
    capturedAtMs: Date.parse(item.createdAt),
    ...(item.utcOffset === undefined ? {} : { utcOffset: item.utcOffset }),
    ...(item.continues === undefined ? {} : { continues: item.continues }),
    payload: canonicalPayload(item.payload),
  };
}
