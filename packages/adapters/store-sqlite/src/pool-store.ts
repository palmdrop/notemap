import { DatabaseSync } from "node:sqlite";

import type {
  Action,
  Clock,
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

import { decodeCursor, encodeCursor, type Keyset } from "./cursor";
import {
  agentColumns,
  itemParams,
  toAction,
  toItem,
  toMillis,
} from "./mapping";
import { LAST_MODIFIED_AT, migrate } from "./migrations";
import type {
  ActionRow,
  ItemAssetRow,
  ItemRow,
  ItemTagRow,
  PoolMetaRow,
} from "./rows";
import { placeholders, statements, type Bindable } from "./statements";
import { serializeTransactions, type Fence } from "./transactions";

export type SqlitePoolStoreConfig = {
  /**
   * A path on a local filesystem, or `:memory:`. Never a network share —
   * SQLite's locking does not survive one, and concurrent hosts are made safe
   * by leasing work instead.
   */
  readonly file: string;
  /**
   * Core's clock, so a pool has one timeline. The store needs its own reading
   * because `modified_at` is the store's to assign, but taking it from here
   * means a test that pins core's clock pins this too. Defaults to the system
   * clock, which is right for a host that has no reason to care.
   */
  readonly clock?: Clock;
  /**
   * How long one transaction may run before it is rolled back. Transactions
   * are serialized, so a callback that never settles stalls every write against
   * the pool; this is the backstop. It is not a budget to design against — a
   * transaction that comes close to it is doing something it should not.
   */
  readonly transactionTimeoutMs?: number;
};

const ITEM_COLUMNS = `
  id, source_id, source_item_id, payload_type, payload_content,
  payload_metadata, created_at, content_updated_at, modified_at,
  revision_of, archived_at, archive_reason
`;

const DEFAULT_ORDER: FeedOrder = "newest-first";

const systemClock: Clock = {
  now: () => new Date().toISOString() as ReturnType<Clock["now"]>,
};

function unimplemented(method: string): () => never {
  return () => {
    throw new Error(`store-sqlite: ${method} is not implemented yet`);
  };
}

export function createSqlitePoolStore(
  config: SqlitePoolStoreConfig,
): PoolStore {
  const writer = new DatabaseSync(config.file);
  writer.exec("PRAGMA foreign_keys = ON");
  if (config.file !== ":memory:") writer.exec("PRAGMA journal_mode = WAL");
  migrate(writer);

  /**
   * Reads run on their own connection so a read outside a transaction cannot
   * observe what an open transaction has written and may still roll back. WAL
   * gives that connection a consistent snapshot without blocking the writer.
   *
   * A `:memory:` database has no second connection to give — each one would be
   * a separate database — so it shares the writer and forfeits that isolation.
   * Tests use files for exactly this reason.
   */
  const reader =
    config.file === ":memory:" ? writer : new DatabaseSync(config.file);
  if (reader !== writer) reader.exec("PRAGMA query_only = ON");

  const write = statements(writer);
  const read = statements(reader);
  const transactions = serializeTransactions(
    writer,
    config.transactionTimeoutMs,
  );
  const clock = config.clock ?? systemClock;

  const insertItem = write.query(`
    INSERT INTO items (${ITEM_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTag = write.query(`
    INSERT INTO item_tags (item_id, name, by_kind, by_ref, added_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertAsset = write.query(`
    INSERT INTO item_assets (item_id, slot, asset_id, hash) VALUES (?, ?, ?, ?)
  `);
  const insertJob = write.query(`
    INSERT INTO jobs (id, kind, subject, enrichment, attempt, enqueued_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAction = write.query(`
    INSERT INTO actions (id, kind, subject, by_kind, by_ref, at, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const lastModifiedAt = write.query<PoolMetaRow, [string]>(
    `SELECT key, value FROM pool_meta WHERE key = ?`,
  );
  const setLastModifiedAt = write.query<never, [string, number]>(`
    INSERT INTO pool_meta (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `);

  function nextModifiedAt(): number {
    const previous = lastModifiedAt.get(LAST_MODIFIED_AT);
    const next = Math.max(toMillis(clock.now()), (previous?.value ?? 0) + 1);
    setLastModifiedAt.run(LAST_MODIFIED_AT, next);
    return next;
  }

  /** Reads inside a transaction must see it; reads outside it must not. */
  function on(inTransaction: boolean) {
    const source = inTransaction ? write : read;

    const itemById = source.query<ItemRow, [string]>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`,
    );
    const itemBySource = source.query<ItemRow, [string, string]>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE source_id = ? AND source_item_id = ?`,
    );
    const newestItem = source.query<ItemRow, []>(
      `SELECT ${ITEM_COLUMNS} FROM items ORDER BY created_at DESC, id DESC LIMIT 1`,
    );

    function hydrate(rows: readonly ItemRow[]): Item[] {
      if (rows.length === 0) return [];
      const ids = rows.map((row) => row.id);
      const slots = placeholders(ids.length);

      const tagRows = source
        .query<ItemTagRow, Bindable[]>(
          `SELECT item_id, name, by_kind, by_ref, added_at FROM item_tags
           WHERE item_id IN (${slots}) ORDER BY name`,
        )
        .all(...ids);
      const assetRows = source
        .query<ItemAssetRow, Bindable[]>(
          `SELECT item_id, slot, asset_id, hash FROM item_assets
           WHERE item_id IN (${slots}) ORDER BY slot`,
        )
        .all(...ids);
      const revisionRows = source
        .query<{ id: string; revision_of: string }, Bindable[]>(
          `SELECT id, revision_of FROM items WHERE revision_of IN (${slots})`,
        )
        .all(...ids);

      // Grouped once rather than filtered per item, which would be quadratic
      // in the page size.
      const group = <T extends { item_id: string }>(all: readonly T[]) => {
        const byItem = new Map<string, T[]>();
        for (const row of all) {
          const existing = byItem.get(row.item_id);
          if (existing) existing.push(row);
          else byItem.set(row.item_id, [row]);
        }
        return byItem;
      };

      const tags = group(tagRows);
      const assets = group(assetRows);
      const supersededBy = new Map(
        revisionRows.map((row) => [row.revision_of, row.id]),
      );

      return rows.map((row) =>
        toItem(
          row,
          tags.get(row.id) ?? [],
          assets.get(row.id) ?? [],
          supersededBy.get(row.id),
        ),
      );
    }

    function one(row: ItemRow | undefined): Item | undefined {
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

    return {
      item: async (id: ItemId): Promise<Item | undefined> =>
        one(itemById.get(id)),

      itemBySourceIdentity: async (
        sourceId: SourceId,
        sourceItemId: string,
      ): Promise<Item | undefined> =>
        one(itemBySource.get(sourceId, sourceItemId)),

      /** The newest by capture time, which is what a later capture must beat to seal it. */
      head: async (): Promise<Item | undefined> => one(newestItem.get()),

      feed: async (page: FeedPage): Promise<Slice<Item>> => {
        const order = page.order ?? DEFAULT_ORDER;
        const descending = order === "newest-first";
        const comparison = descending ? "<" : ">";
        const direction = descending ? "DESC" : "ASC";

        const { rows, next } = keysetPage(page, order, (after, limit) => {
          const where =
            after === undefined
              ? ""
              : `WHERE created_at ${comparison} ? OR (created_at = ? AND id ${comparison} ?)`;
          const params: Bindable[] =
            after === undefined
              ? [limit]
              : [after.at, after.at, after.id, limit];

          return source
            .query<ItemRow, Bindable[]>(
              `SELECT ${ITEM_COLUMNS} FROM items ${where}
               ORDER BY created_at ${direction}, id ${direction} LIMIT ?`,
            )
            .all(...params)
            .map((row) => ({ ...row, at: row.created_at }));
        });

        return {
          values: hydrate(rows),
          ...(next === undefined ? {} : { next }),
        };
      },

      actions: async (
        subject: ItemId | undefined,
        page: Page,
      ): Promise<Slice<Action>> => {
        const { rows, next } = keysetPage(
          page,
          "oldest-first",
          (after, limit) => {
            const clauses: string[] = [];
            const params: Bindable[] = [];

            if (subject !== undefined) {
              clauses.push("subject = ?");
              params.push(subject);
            }
            if (after !== undefined) {
              clauses.push("(at > ? OR (at = ? AND id > ?))");
              params.push(after.at, after.at, after.id);
            }

            const where = clauses.length
              ? `WHERE ${clauses.join(" AND ")}`
              : "";
            params.push(limit);

            return source
              .query<ActionRow, Bindable[]>(
                `SELECT id, kind, subject, by_kind, by_ref, at, detail FROM actions
               ${where} ORDER BY at ASC, id ASC LIMIT ?`,
              )
              .all(...params);
          },
        );

        return {
          values: rows.map(toAction),
          ...(next === undefined ? {} : { next }),
        };
      },
    };
  }

  const committed = on(false);
  const uncommitted = on(true);

  /**
   * Built per transaction rather than once, because every method has to consult
   * that transaction's fence — a handle outliving its transaction would write
   * outside one, or into whichever started next.
   */
  function poolTx(fence: Fence): PoolTx {
    const guard = <A extends unknown[], R>(
      method: (...args: A) => Promise<R>,
    ) => {
      return async (...args: A): Promise<R> => {
        fence.check();
        return method(...args);
      };
    };

    return {
      ...notYetImplementedReads(),

      item: guard(uncommitted.item),
      itemBySourceIdentity: guard(uncommitted.itemBySourceIdentity),
      head: guard(uncommitted.head),
      feed: guard(uncommitted.feed),
      actions: guard(uncommitted.actions),

      insertItem: guard(async (record: ItemRecord): Promise<Item> => {
        insertItem.run(...itemParams(record, nextModifiedAt()));

        for (const tag of record.tags) {
          insertTag.run(
            record.id,
            tag.name,
            ...agentColumns(tag.by),
            toMillis(tag.addedAt),
          );
        }

        for (const ref of record.payload.assets) {
          insertAsset.run(record.id, ref.slot, ref.asset, ref.hash);
        }

        const stored = await uncommitted.item(record.id);
        if (stored === undefined) {
          throw new Error("the item just written could not be read back");
        }
        return stored;
      }),

      appendAction: guard(async (action: Action): Promise<void> => {
        insertAction.run(
          action.id,
          action.kind,
          action.subject ?? null,
          ...agentColumns(action.by),
          toMillis(action.at),
          JSON.stringify(action.detail),
        );
      }),

      enqueue: guard(async (enqueued: readonly Job[]): Promise<void> => {
        for (const job of enqueued) {
          insertJob.run(
            job.id,
            job.kind,
            job.subject,
            job.enrichment ?? null,
            job.attempt,
            toMillis(job.enqueuedAt),
          );
        }
      }),
    };
  }

  return {
    ...committed,
    ...notYetImplementedReads(),

    transaction: <T>(work: (handle: PoolTx) => Promise<T>): Promise<T> =>
      transactions.run((fence) => work(poolTx(fence))),

    claim: unimplemented("claim"),
    extendLease: unimplemented("extendLease"),
    releaseLease: unimplemented("releaseLease"),

    close: async () => {
      if (reader !== writer) reader.close();
      writer.close();
    },
  };
}

/**
 * The reads the store will answer once their slice is built. Stubbed rather
 * than omitted so the driver is a whole `PoolStore` and a host can wire it
 * without knowing how far along it is.
 */
function notYetImplementedReads() {
  return {
    revisionChain: unimplemented("revisionChain"),
    tombstone: unimplemented("tombstone"),
    queue: unimplemented("queue"),
    archived: unimplemented("archived"),
    suggestions: unimplemented("suggestions"),
    suggestion: unimplemented("suggestion"),
    routingRecords: unimplemented("routingRecords"),
    artifacts: unimplemented("artifacts"),
    enrichmentStates: unimplemented("enrichmentStates"),
    abandonedEnrichments: unimplemented("abandonedEnrichments"),
    unreferencedAssets: unimplemented("unreferencedAssets"),
    changesSince: unimplemented("changesSince"),
  };
}
