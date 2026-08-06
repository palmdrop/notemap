import { ok, refused } from "../result";
import type { PoolConfig } from "../types/api/config";
import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { CaptureRefusal } from "../types/api/refusal";
import type { Agent } from "../types/domain/agent";
import type { CaptureEnvelope, CaptureOutcome } from "../types/domain/capture";
import type { ActionId, ItemId, JobId } from "../types/domain/ids";
import type { Item, ItemRecord } from "../types/domain/item";
import type { Result } from "../types/result";

import { sameInstant, sameJson } from "./equality";

type CaptureResult = Result<CaptureOutcome, CaptureRefusal>;

export async function capture(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
): Promise<CaptureResult> {
  const invalid = validate(config, ports, envelope);
  if (invalid !== undefined) return refused(invalid);

  return ports.store.transaction((tx) => append(ports, envelope, tx));
}

/**
 * Everything decidable without reading the pool, so the transaction opens only
 * once the capture is known to be well formed — the store holds a write lock
 * for as long as it is open.
 */
function validate(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
): CaptureRefusal | undefined {
  const source = config.sources.find((known) => known.id === envelope.source);
  if (source === undefined) {
    return { kind: "unknown-source", source: envelope.source };
  }

  const type = config.payloadTypes.find(
    (known) => known.name === envelope.payload.type,
  );
  if (type === undefined) {
    return { kind: "unknown-payload-type", type: envelope.payload.type };
  }

  const issues = ports.schemas.validate(
    type.contentSchema,
    envelope.payload.content,
  );
  if (issues.length > 0) return { kind: "payload-invalid", issues };

  const filled = new Set(envelope.payload.assets.map((ref) => ref.slot));
  const missing = type.requiredSlots.find((slot) => !filled.has(slot));
  if (missing !== undefined) {
    return { kind: "missing-asset-slot", slot: missing };
  }

  // `unknown-asset` and `asset-hash-mismatch` are not checked here yet: no
  // AssetStore implementation exists to resolve a reference against.
  return undefined;
}

async function append(
  ports: PoolPorts,
  envelope: CaptureEnvelope,
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
  if (bySource !== undefined) {
    return isReplayOf(bySource, envelope)
      ? ok({ kind: "already-captured", item: bySource, matchedOn: "source" })
      : refused({ kind: "source-item-changed", existing: bySource.id });
  }

  const by: Agent = { kind: "source", source: envelope.source };
  const record: ItemRecord = {
    id: envelope.id ?? ports.ids.next<ItemId>(),
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    tags: (envelope.tags ?? []).map((name) => ({
      name,
      by,
      addedAt: envelope.capturedAt,
    })),
    createdAt: envelope.capturedAt,
  };

  const item = await tx.insertItem(record);
  const at = ports.clock.now();

  // In the same transaction as the item: one committed with nothing recording
  // that its mirror is owed would never be written, and nothing would notice.
  await tx.enqueue([
    {
      id: ports.ids.next<JobId>(),
      kind: "mirror",
      subject: item.id,
      attempt: 0,
      enqueuedAt: at,
    },
  ]);

  await tx.appendAction({
    id: ports.ids.next<ActionId>(),
    kind: "captured",
    subject: item.id,
    by,
    at,
    detail: {},
  });

  return ok({ kind: "captured", item });
}

/**
 * Compares only what the capture fixed. Tags are excluded deliberately: they go
 * on changing after capture, so an item classified since would otherwise read
 * as a conflicting resubmission of itself.
 */
function isReplayOf(existing: Item, envelope: CaptureEnvelope): boolean {
  return (
    existing.source === envelope.source &&
    existing.sourceItemId === envelope.sourceItemId &&
    sameInstant(existing.createdAt, envelope.capturedAt) &&
    existing.payload.type === envelope.payload.type &&
    sameJson(existing.payload.content, envelope.payload.content) &&
    sameJson(existing.payload.metadata, envelope.payload.metadata) &&
    sameAssets(existing, envelope)
  );
}

function sameAssets(existing: Item, envelope: CaptureEnvelope): boolean {
  const held = new Map(existing.payload.assets.map((ref) => [ref.slot, ref]));
  return (
    held.size === envelope.payload.assets.length &&
    envelope.payload.assets.every((ref) => {
      const mine = held.get(ref.slot);
      return mine?.asset === ref.asset && mine.hash === ref.hash;
    })
  );
}
