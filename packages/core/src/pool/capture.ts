import { dequal } from "dequal";

import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { checkAssets, checkPayload } from "./payload";
import { normalised } from "./tags";
import { ok, refused } from "../utils/result";
import type { PoolConfig } from "../types/api/config";
import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { CaptureRefusal } from "../types/api/refusal";
import type { Agent } from "../types/domain/agent";
import type { CaptureEnvelope, CaptureOutcome } from "../types/domain/capture";
import type { ItemId } from "../types/domain/ids";
import type { Item, ItemRecord } from "../types/domain/item";
import type { Payload } from "../types/domain/payload";
import type { Result } from "../types/result";

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

/** Everything decidable without reading the pool, so a malformed capture never opens a transaction. */
function validate(
  config: PoolConfig,
  ports: PoolPorts,
  envelope: CaptureEnvelope,
): CaptureRefusal | undefined {
  // `config.sources` is a policy registry, not a guest list: a source absent
  // from it captures normally, with no policy attached. `unknown-asset` needs
  // the pool, so it is decided inside the transaction.
  return checkPayload(config, ports, envelope.payload);
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

  const unknown = await checkAssets(tx, envelope.payload);
  if (unknown !== undefined) return refused(unknown);

  const by: Agent = { kind: "source", source: envelope.source };
  const record: ItemRecord = {
    id: envelope.id ?? ports.ids.next<ItemId>(),
    source: envelope.source,
    sourceItemId: envelope.sourceItemId,
    payload: envelope.payload,
    // Dropped rather than refused: a whole capture is not lost over a stray tag.
    tags: (envelope.tags ?? []).flatMap((name) => {
      const tag = normalised(name);
      return tag === undefined
        ? []
        : [{ name: tag, by, addedAt: envelope.capturedAt }];
    }),
    createdAt: envelope.capturedAt,
  };

  const item = await tx.insertItem(record);
  const at = ports.clock.now();

  await enqueueMirrorWrite(ports, tx, item.id, at);

  await recordAction(ports, tx, {
    kind: "captured",
    subject: item.id,
    by,
    at,
    detail: {},
  });

  return ok({ kind: "captured", item });
}

/**
 * What a capture fixed, from either side, in one comparable shape.
 *
 * By exclusion rather than enumeration, so a field added to the envelope is
 * compared by default. Tags are dropped because they go on changing after
 * capture, and an item classified since would otherwise read as a conflicting
 * resubmission of itself.
 */
type FixedByCapture = Omit<CaptureEnvelope, "id" | "tags" | "capturedAt"> & {
  /** As an instant: a timestamp's spelling is not part of what it means. */
  readonly capturedAtMs: number;
};

function isReplayOf(existing: Item, envelope: CaptureEnvelope): boolean {
  return dequal(fixedByItem(existing), fixedByEnvelope(envelope));
}

function fixedByEnvelope(envelope: CaptureEnvelope): FixedByCapture {
  const { id, tags, capturedAt, ...fixed } = envelope;
  return {
    ...fixed,
    capturedAtMs: Date.parse(capturedAt),
    payload: canonical(envelope.payload),
  };
}

function fixedByItem(item: Item): FixedByCapture {
  return {
    source: item.source,
    sourceItemId: item.sourceItemId,
    capturedAtMs: Date.parse(item.createdAt),
    payload: canonical(item.payload),
  };
}

/** Asset order carries no meaning, so neither side gets to differ by it. */
function canonical(payload: Payload): Payload {
  return {
    ...payload,
    assets: [...payload.assets].sort((a, b) =>
      a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0,
    ),
  };
}
