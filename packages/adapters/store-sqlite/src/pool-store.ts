import { fileURLToPath } from "node:url";

import type {
  Action,
  FeedOrder,
  FeedPage,
  Item,
  ItemId,
  ItemRecord,
  Job,
  Page,
  PageCursor,
  PoolStore,
  PoolTx,
  Slice,
  SourceId,
} from "@notemap/core";
import Database from "better-sqlite3";
import { and, asc, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { decodeCursor, encodeCursor, type Keyset } from "./cursor";
import {
  agentColumns,
  toAction,
  toItem,
  toMillis,
  type AssetRow,
  type ItemRow,
  type TagRow,
} from "./mapping";
import {
  actions,
  itemAssets,
  items,
  itemTags,
  jobs,
  LAST_MODIFIED_AT,
  poolMeta,
} from "./schema";
import { serializeTransactions } from "./transactions";

/**
 * How far along the driver is. The store is built one slice at a time, and a
 * narrowed type says so — rather than a full `PoolStore` whose unbuilt half
 * throws.
 */
type ImplementedReads =
  "item" | "itemBySourceIdentity" | "head" | "feed" | "actions";

export type CaptureSliceTx = Pick<
  PoolTx,
  ImplementedReads | "insertItem" | "appendAction" | "enqueue"
>;

export type SqlitePoolStore = Pick<PoolStore, ImplementedReads> & {
  transaction<T>(work: (tx: CaptureSliceTx) => Promise<T>): Promise<T>;
  close(): void;
};

export type SqlitePoolStoreConfig = {
  /**
   * A path on a local filesystem, or `:memory:`. Never a network share —
   * SQLite's locking does not survive one, and concurrent hosts are made safe
   * by leasing work instead.
   */
  readonly file: string;
  /** Milliseconds since the epoch. Injected so a test can pin what the store stamps. */
  readonly now?: () => number;
};

type Queryable = Pick<BetterSQLite3Database, "select" | "insert">;

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

const DEFAULT_ORDER: FeedOrder = "newest-first";

export function createSqlitePoolStore(
  config: SqlitePoolStoreConfig,
): SqlitePoolStore {
  const connection = new Database(config.file);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");

  const db = drizzle(connection);
  migrate(db, { migrationsFolder: MIGRATIONS });

  const clock = config.now ?? Date.now;
  const transactions = serializeTransactions(connection);

  function nextModifiedAt(tx: Queryable): number {
    const previous = tx
      .select()
      .from(poolMeta)
      .where(eq(poolMeta.key, LAST_MODIFIED_AT))
      .get();

    const next = Math.max(clock(), (previous?.value ?? 0) + 1);

    tx.insert(poolMeta)
      .values({ key: LAST_MODIFIED_AT, value: next })
      .onConflictDoUpdate({ target: poolMeta.key, set: { value: next } })
      .run();

    return next;
  }

  function hydrate(rows: readonly ItemRow[]): Item[] {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const tagRows: TagRow[] = db
      .select()
      .from(itemTags)
      .where(inArray(itemTags.itemId, ids))
      .orderBy(asc(itemTags.name))
      .all();
    const assetRows: AssetRow[] = db
      .select()
      .from(itemAssets)
      .where(inArray(itemAssets.itemId, ids))
      .orderBy(asc(itemAssets.slot))
      .all();
    const revisions = db
      .select({ id: items.id, revisionOf: items.revisionOf })
      .from(items)
      .where(inArray(items.revisionOf, ids))
      .all();

    return rows.map((row) =>
      toItem(
        row,
        tagRows.filter((tag) => tag.itemId === row.id),
        assetRows.filter((asset) => asset.itemId === row.id),
        revisions.find((revision) => revision.revisionOf === row.id)?.id,
      ),
    );
  }

  function readItem(id: string): Item | undefined {
    const row = db.select().from(items).where(eq(items.id, id)).get();
    return row === undefined ? undefined : hydrate([row])[0];
  }

  function keysetPage<T extends { at: number; id: string }>(
    page: Page,
    order: FeedOrder,
    fetch: (after: Keyset | undefined, limit: number) => readonly T[],
  ): { readonly rows: readonly T[]; readonly next: PageCursor | undefined } {
    const after = page.after ? decodeCursor(page.after, order) : undefined;
    // One more row than asked for, so exhaustion is known rather than guessed.
    const rows = fetch(after, page.limit + 1);
    const hasMore = rows.length > page.limit;
    const values = hasMore ? rows.slice(0, page.limit) : rows;
    const last = values.at(-1);

    return {
      rows: values,
      next: hasMore && last ? encodeCursor(last, order) : undefined,
    };
  }

  const reads = {
    item: async (id: ItemId): Promise<Item | undefined> => readItem(id),

    itemBySourceIdentity: async (
      source: SourceId,
      sourceItemId: string,
    ): Promise<Item | undefined> => {
      const row = db
        .select()
        .from(items)
        .where(
          and(eq(items.sourceId, source), eq(items.sourceItemId, sourceItemId)),
        )
        .get();
      return row === undefined ? undefined : hydrate([row])[0];
    },

    /** The newest by capture time, which is what a later capture has to beat to seal it. */
    head: async (): Promise<Item | undefined> => {
      const row = db
        .select()
        .from(items)
        .orderBy(desc(items.createdAt), desc(items.id))
        .limit(1)
        .get();
      return row === undefined ? undefined : hydrate([row])[0];
    },

    feed: async (page: FeedPage): Promise<Slice<Item>> => {
      const order = page.order ?? DEFAULT_ORDER;
      const newestFirst = order === "newest-first";

      const { rows, next } = keysetPage(page, order, (after, limit) =>
        db
          .select()
          .from(items)
          .where(
            after === undefined
              ? undefined
              : newestFirst
                ? or(
                    lt(items.createdAt, after.at),
                    and(eq(items.createdAt, after.at), lt(items.id, after.id)),
                  )
                : or(
                    gt(items.createdAt, after.at),
                    and(eq(items.createdAt, after.at), gt(items.id, after.id)),
                  ),
          )
          .orderBy(
            newestFirst ? desc(items.createdAt) : asc(items.createdAt),
            newestFirst ? desc(items.id) : asc(items.id),
          )
          .limit(limit)
          .all()
          .map((row) => ({ ...row, at: row.createdAt })),
      );

      return {
        values: hydrate(rows),
        ...(next === undefined ? {} : { next }),
      };
    },

    actions: async (
      subject: ItemId | undefined,
      page: Page,
    ): Promise<Slice<Action>> => {
      const { rows, next } = keysetPage(page, "oldest-first", (after, limit) =>
        db
          .select()
          .from(actions)
          .where(
            and(
              subject === undefined ? undefined : eq(actions.subject, subject),
              after === undefined
                ? undefined
                : or(
                    gt(actions.at, after.at),
                    and(eq(actions.at, after.at), gt(actions.id, after.id)),
                  ),
            ),
          )
          .orderBy(asc(actions.at), asc(actions.id))
          .limit(limit)
          .all(),
      );

      return {
        values: rows.map(toAction),
        ...(next === undefined ? {} : { next }),
      };
    },
  } satisfies Pick<PoolStore, ImplementedReads>;

  const writes = {
    insertItem: async (record: ItemRecord): Promise<Item> => {
      db.insert(items)
        .values({
          id: record.id,
          sourceId: record.source,
          sourceItemId: record.sourceItemId,
          payloadType: record.payload.type,
          payloadContent: record.payload.content,
          payloadMetadata: record.payload.metadata,
          createdAt: toMillis(record.createdAt),
          contentUpdatedAt:
            record.contentUpdatedAt === undefined
              ? null
              : toMillis(record.contentUpdatedAt),
          modifiedAt: nextModifiedAt(db),
          revisionOf: record.revisionOf ?? null,
          archivedAt:
            record.archived === undefined
              ? null
              : toMillis(record.archived.archivedAt),
          archiveReason: record.archived?.reason ?? null,
        })
        .run();

      if (record.tags.length > 0) {
        db.insert(itemTags)
          .values(
            record.tags.map((tag) => ({
              itemId: record.id,
              name: tag.name,
              addedAt: toMillis(tag.addedAt),
              ...agentColumns(tag.by),
            })),
          )
          .run();
      }

      if (record.payload.assets.length > 0) {
        db.insert(itemAssets)
          .values(
            record.payload.assets.map((ref) => ({
              itemId: record.id,
              slot: ref.slot,
              assetId: ref.asset,
              hash: ref.hash,
            })),
          )
          .run();
      }

      const stored = readItem(record.id);
      if (stored === undefined) {
        throw new Error("the item just written could not be read back");
      }
      return stored;
    },

    appendAction: async (action: Action): Promise<void> => {
      db.insert(actions)
        .values({
          id: action.id,
          kind: action.kind,
          subject: action.subject ?? null,
          at: toMillis(action.at),
          detail: action.detail,
          ...agentColumns(action.by),
        })
        .run();
    },

    enqueue: async (enqueued: readonly Job[]): Promise<void> => {
      if (enqueued.length === 0) return;
      db.insert(jobs)
        .values(
          enqueued.map((job) => ({
            id: job.id,
            kind: job.kind,
            subject: job.subject,
            enrichment: job.enrichment ?? null,
            attempt: job.attempt,
            enqueuedAt: toMillis(job.enqueuedAt),
          })),
        )
        .run();
    },
  };

  /**
   * The same read functions the store exposes. Inside a transaction they run
   * on the same connection, so core sees what it has written but not committed.
   */
  const tx: CaptureSliceTx = { ...reads, ...writes };

  return {
    ...reads,
    transaction: <T>(
      work: (handle: CaptureSliceTx) => Promise<T>,
    ): Promise<T> => transactions.run(() => work(tx)),
    close: () => connection.close(),
  };
}
