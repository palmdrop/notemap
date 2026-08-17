import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  Asset,
  AssetId,
  BlobHash,
  CapabilityName,
  Clock,
  DestinationId,
  IdGenerator,
  Item,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  MintableId,
  PayloadTypeName,
  RoutingRecord,
  RoutingRecordId,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

import { createSqlitePoolStore, type SqlitePoolStore } from "../pool-store";

export const SCRATCHPAD = "scratchpad" as SourceId;
export const TEXT = "text" as PayloadTypeName;

export function at(value: string): Timestamp {
  return value as Timestamp;
}

/**
 * A store over a file in its own temporary directory, torn down after the test.
 *
 * Files rather than `:memory:` on purpose: a `:memory:` database cannot have
 * the second connection reads use, so it would exercise different isolation
 * from the one that ships.
 */
export type StoreOptions = {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly transactionTimeoutMs?: number;
};

export function store(options: StoreOptions = {}): {
  pool: SqlitePoolStore;
  file: string;
  /** A second connection, for asserting on tables no port method reaches yet. */
  raw: DatabaseSync;
  cleanup: () => Promise<void>;
} {
  const directory = mkdtempSync(join(tmpdir(), "notemap-store-"));
  const file = join(directory, "pool.db");
  const pool = createSqlitePoolStore({ file, ...options });
  const raw = new DatabaseSync(file);

  return {
    pool,
    file,
    raw,
    cleanup: async () => {
      raw.close();
      await pool.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Names every minted id after its order, so a test can predict a lease. */
export function countingIds(prefix = "lease"): IdGenerator {
  let count = 0;
  return { next: <T extends MintableId>() => `${prefix}-${++count}` as T };
}

/** A clock that stands still until a test moves it. */
export function frozenClock(start = "2026-08-03T09:00:00.000Z"): Clock & {
  set: (value: string) => void;
} {
  let current = start;
  return {
    now: () => current as Timestamp,
    set: (value) => {
      current = value;
    },
  };
}

type CaptureOverrides = {
  readonly id?: string;
  readonly source?: SourceId;
  readonly sourceItemId?: string;
  readonly text?: string;
  readonly createdAt?: string;
  readonly contentUpdatedAt?: string;
  readonly tags?: readonly { name: string; by: Agent; addedAt: string }[];
  readonly assets?: readonly { slot: string; asset: string }[];
  readonly revisionOf?: string;
};

export function capture(overrides: CaptureOverrides = {}): ItemRecord {
  const id = overrides.id ?? "item-1";
  return {
    id: id as ItemId,
    source: overrides.source ?? SCRATCHPAD,
    sourceItemId: overrides.sourceItemId ?? `src-${id}`,
    payload: {
      type: TEXT,
      content: { text: overrides.text ?? "a thought" },
      metadata: {},
      assets: (overrides.assets ?? []).map((ref) => ({
        slot: ref.slot,
        asset: ref.asset as AssetId,
      })),
    },
    tags: (overrides.tags ?? []).map((tag) => ({
      name: tag.name as TagName,
      by: tag.by,
      addedAt: at(tag.addedAt),
    })),
    createdAt: at(overrides.createdAt ?? "2026-08-03T09:00:00.000Z"),
    ...(overrides.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: at(overrides.contentUpdatedAt) }),
    ...(overrides.revisionOf === undefined
      ? {}
      : { revisionOf: overrides.revisionOf as ItemId }),
  };
}

export function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: (overrides.id ?? "asset-1") as AssetId,
    filename: overrides.filename ?? "photo.png",
    mime: overrides.mime ?? "image/png",
    blob: (overrides.blob ?? "blob-abc") as BlobHash,
    bytes: overrides.bytes ?? 12,
  };
}

/** A foreign key stands under every reference, so a capture's assets exist first. */
export function putAssets(
  pool: SqlitePoolStore,
  ...assets: readonly Asset[]
): Promise<void> {
  return pool.transaction(async (tx) => {
    for (const each of assets) await tx.insertAsset(each);
  });
}

/** Carries the original's capture time and source identity; the edit is recorded separately. */
export function revisionOf(
  original: ItemRecord,
  overrides: { id: string; text: string; editedAt: string },
): ItemRecord {
  return capture({
    id: overrides.id,
    text: overrides.text,
    sourceItemId: original.sourceItemId,
    createdAt: original.createdAt,
    contentUpdatedAt: overrides.editedAt,
    revisionOf: original.id,
  });
}

export function captured(
  item: ItemRecord,
  actionId = `action-${item.id}`,
): Action {
  return {
    id: actionId as ActionId,
    kind: "captured" satisfies ActionKind,
    subject: item.id,
    by: { kind: "source", source: item.source },
    at: item.createdAt,
    detail: {},
  };
}

export function markedProcessed(
  item: ItemRecord,
  overrides: { id?: string; at?: string; note?: string } = {},
): RoutingRecord {
  return {
    id: (overrides.id ?? `routing-${item.id}`) as RoutingRecordId,
    item: item.id,
    target: {
      kind: "user",
      ...(overrides.note === undefined ? {} : { note: overrides.note }),
    },
    state: "delivered",
    at: at(overrides.at ?? "2026-08-03T10:00:00.000Z"),
  };
}

export function reserved(
  item: ItemRecord,
  overrides: { id?: string; at?: string; capability?: string } = {},
): RoutingRecord {
  return {
    id: (overrides.id ?? `routing-${item.id}`) as RoutingRecordId,
    item: item.id,
    target: {
      kind: "destination",
      destination: "vault" as DestinationId,
      capability: (overrides.capability ?? "create-note") as CapabilityName,
      target: { path: "inbox/a-thought.md" },
    },
    state: "pending",
    at: at(overrides.at ?? "2026-08-03T10:00:00.000Z"),
  };
}

export function deliveryJob(
  record: RoutingRecord,
  jobId = `job-${record.id}`,
): Job {
  return {
    id: jobId as JobId,
    kind: "delivery",
    subject: { kind: "routing-record", record: record.id },
    attempt: 0,
    enqueuedAt: record.at,
  };
}

export function mirrorJob(item: ItemRecord, jobId = `job-${item.id}`): Job {
  return {
    id: jobId as JobId,
    kind: "mirror",
    subject: { kind: "item", item: item.id },
    attempt: 0,
    enqueuedAt: item.createdAt,
  };
}

/**
 * A capture as core will perform one: the item, the work it owes and the entry
 * recording it, all in one transaction. The store has no `appendCapture` — the
 * shape of a domain operation is core's, not the driver's — so the tests
 * assemble it here rather than repeating it.
 */
export function appendCapture(
  pool: SqlitePoolStore,
  record: ItemRecord,
  enqueued: readonly Job[] = [],
  action: Action = captured(record),
): Promise<Item> {
  return pool.transaction(async (tx) => {
    const item = await tx.insertItem(record);
    await tx.enqueue(enqueued);
    await tx.appendAction(action);
    return item;
  });
}
