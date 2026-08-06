import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  AssetId,
  BlobHash,
  Item,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  PayloadTypeName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";
import Database from "better-sqlite3";

import {
  createSqlitePoolStore,
  type CaptureSliceTx,
  type SqlitePoolStore,
} from "../pool-store";

export const SCRATCHPAD = "scratchpad" as SourceId;
export const TEXT = "text" as PayloadTypeName;

export function at(value: string): Timestamp {
  return value as Timestamp;
}

/**
 * A store over its own private `:memory:` database. Two of these share nothing,
 * which is what makes the "two pools in one process" guarantee testable.
 */
export function store(now?: () => number): SqlitePoolStore {
  return createSqlitePoolStore({
    file: ":memory:",
    ...(now === undefined ? {} : { now }),
  });
}

/**
 * A store over a real file, plus a second connection to the same database. The
 * second connection is how a test reads tables this slice has no port method
 * for yet — the jobs a capture enqueued, for one.
 */
export function fileStore(now?: () => number): {
  store: SqlitePoolStore;
  raw: Database.Database;
  cleanup: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "notemap-store-"));
  const file = join(directory, "pool.db");
  const opened = createSqlitePoolStore({
    file,
    ...(now === undefined ? {} : { now }),
  });
  const raw = new Database(file, { readonly: true });

  return {
    store: opened,
    raw,
    cleanup: () => {
      raw.close();
      opened.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A clock that stands still until a test moves it. */
export function frozenClock(start = 1_000_000): {
  now: () => number;
  set: (value: number) => void;
} {
  let current = start;
  return {
    now: () => current,
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
    ...(overrides.revisionOf === undefined
      ? {}
      : { revisionOf: overrides.revisionOf as ItemId }),
  };
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
  return pool.transaction(async (tx: CaptureSliceTx) => {
    const item = await tx.insertItem(record);
    await tx.enqueue(enqueued);
    await tx.appendAction(action);
    return item;
  });
}
