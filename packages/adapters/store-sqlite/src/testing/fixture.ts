import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  AssetId,
  BlobHash,
  Clock,
  IdGenerator,
  Item,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  MintableId,
  PayloadTypeName,
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
  readonly assets?: readonly { slot: string; asset: string; hash: string }[];
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
        hash: ref.hash as BlobHash,
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

export function mirrorJob(item: ItemRecord, jobId = `job-${item.id}`): Job {
  return {
    id: jobId as JobId,
    kind: "mirror",
    subject: item.id,
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
