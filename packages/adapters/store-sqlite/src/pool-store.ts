import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  AbandonedPosition,
  Action,
  ActionQuery,
  Artifact,
  ClaimRequest,
  Clock,
  JobResolution,
  RoutingRecord,
  IdGenerator,
  Item,
  ItemId,
  ItemRecord,
  Job,
  LeaseId,
  MintableId,
  OrderedPage,
  Page,
  PoolStore,
  PoolTx,
  Position,
  ReadOrder,
  Slice,
  SourceId,
  Timestamp,
  WorkQueue,
} from "@notemap/core";

import {
  agentColumns,
  itemParams,
  toAction,
  toItem,
  toMillis,
  toTimestamp,
} from "./mapping";
import { abandonedWork, jobQueue } from "./jobs";
import { LAST_MODIFIED_AT, migrate } from "./migrations";
import type {
  ActionRow,
  ItemAssetRow,
  ItemRow,
  ItemTagRow,
  PoolMetaRow,
} from "./rows";
import { placeholders, statements, type Bindable } from "./statements";
import { writeLock, type Fence } from "./write-lock";

export type SqlitePoolStoreConfig = {
  /** A local path or `:memory:`. Never a network share: SQLite's locking does not survive one. */
  readonly file: string;
  /** Core's clock, so a pool has one timeline. `modified_at` is read off it. */
  readonly clock?: Clock;
  /** Mints lease ids, which are the store's own. Defaults to random UUIDs. */
  readonly ids?: IdGenerator;
  /**
   * The backstop for a callback that never settles, which would otherwise stall
   * every write against the pool. Not a budget to design against.
   */
  readonly transactionTimeoutMs?: number;
};

const ITEM_COLUMNS = `
  id, source_id, source_item_id, payload_type, payload_content,
  payload_metadata, created_at, content_updated_at, modified_at,
  revision_of, archived_at, archive_reason
`;

/** The write lock serializes this process, so SQLITE_BUSY is only ever a second host. */
const BUSY_TIMEOUT_MS = 5_000;

const systemClock: Clock = {
  now: () => new Date().toISOString() as ReturnType<Clock["now"]>,
};

const randomIds: IdGenerator = {
  next: <T extends MintableId>() => randomUUID() as T,
};

function direction(order: ReadOrder): {
  readonly sql: "ASC" | "DESC";
  readonly comparison: "<" | ">";
} {
  return order === "newest-first"
    ? { sql: "DESC", comparison: "<" }
    : { sql: "ASC", comparison: ">" };
}

/** A position in the store's own units. */
type Bound = { readonly at: number; readonly id?: string };

function bound(position: Position): Bound {
  return {
    at: toMillis(position.at),
    ...(position.id === undefined ? {} : { id: position.id }),
  };
}

/**
 * The comparison that continues a read past one position, in whichever
 * direction it runs. A row value rather than the `OR` form that spells out the
 * same thing: SQLite seeks straight to the position on this, and scans the
 * index from the end on that, which costs a page its offset in rows.
 */
function keysetClause(
  column: string,
  after: Bound,
  comparison: "<" | ">",
): { readonly sql: string; readonly params: Bindable[] } {
  if (after.id === undefined) {
    return { sql: `${column} ${comparison} ?`, params: [after.at] };
  }

  return {
    sql: `(${column}, id) ${comparison} (?, ?)`,
    params: [after.at, after.id],
  };
}

function unimplemented(method: string): () => never {
  return () => {
    throw new Error(`store-sqlite: ${method} is not implemented yet`);
  };
}

/**
 * Both ports in one object: the queue is rows in the same database, so its
 * claims share the write lock with the transactions they race against.
 */
export type SqlitePoolStore = PoolStore & WorkQueue;

export function createSqlitePoolStore(
  config: SqlitePoolStoreConfig,
): SqlitePoolStore {
  const writer = new DatabaseSync(config.file);
  let reader = writer;
  try {
    writer.exec("PRAGMA foreign_keys = ON");
    writer.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    if (config.file !== ":memory:") writer.exec("PRAGMA journal_mode = WAL");
    migrate(writer);

    /**
     * Reads get their own connection, so one outside a transaction cannot see
     * what that transaction may still roll back. A `:memory:` database has no
     * second connection to give — each would be a separate database — so it
     * shares the writer and forfeits that isolation.
     */
    if (config.file !== ":memory:") {
      reader = new DatabaseSync(config.file);
      reader.exec("PRAGMA query_only = ON");
      reader.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    }
  } catch (cause) {
    // A store that failed to open leaves the caller no connection to close.
    if (reader !== writer) reader.close();
    writer.close();
    throw cause;
  }

  const write = statements(writer);
  const read = statements(reader);
  const writes = writeLock(writer, config.transactionTimeoutMs);
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
  const jobs = jobQueue(write, config.ids ?? randomIds);
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
    /**
     * `revision_of IS NULL` because a whole chain shares one source identity,
     * and the capture at its root is the link that answers for it.
     */
    const itemBySource = source.query<ItemRow, [string, string]>(
      `SELECT ${ITEM_COLUMNS} FROM items
       WHERE source_id = ? AND source_item_id = ? AND revision_of IS NULL`,
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

    /**
     * Keyset, not offset: a row inserted behind the reader cannot make a page
     * skip or repeat.
     */
    function keysetPage<T extends { at: number; id: string }>(
      page: Page,
      fetch: (after: Bound | undefined, limit: number) => readonly T[],
    ): { readonly rows: readonly T[]; readonly next: Position | undefined } {
      if (!Number.isInteger(page.limit) || page.limit <= 0) {
        throw new TypeError(
          `page limit must be a positive integer: ${page.limit}`,
        );
      }

      const after = page.after && bound(page.after);
      // One more row than asked for, so exhaustion is known rather than guessed.
      const rows = fetch(after, page.limit + 1);
      const hasMore = rows.length > page.limit;
      const values = hasMore ? rows.slice(0, page.limit) : rows;
      const last = values.at(-1);

      return {
        rows: values,
        next:
          hasMore && last
            ? { at: toTimestamp(last.at), id: last.id }
            : undefined,
      };
    }

    return {
      item: async (id: ItemId): Promise<Item | undefined> =>
        one(itemById.get(id)),

      abandonedWork: async (page: Page<AbandonedPosition>) =>
        abandonedWork(source, page),

      // Neither has a table yet, so empty is what an item genuinely has.
      artifacts: async (): Promise<readonly Artifact[]> => [],
      routingRecords: async (): Promise<readonly RoutingRecord[]> => [],

      itemBySourceIdentity: async (
        sourceId: SourceId,
        sourceItemId: string,
      ): Promise<Item | undefined> =>
        one(itemBySource.get(sourceId, sourceItemId)),

      /** The newest by capture time, which is what a later capture must beat to seal it. */
      head: async (): Promise<Item | undefined> => one(newestItem.get()),

      feed: async (page: OrderedPage): Promise<Slice<Item>> => {
        const way = direction(page.order);

        const { rows, next } = keysetPage(page, (after, limit) => {
          const keyset =
            after === undefined
              ? undefined
              : keysetClause("created_at", after, way.comparison);
          const where = keyset === undefined ? "" : `WHERE ${keyset.sql}`;
          const params: Bindable[] = [...(keyset?.params ?? []), limit];

          return source
            .query<ItemRow, Bindable[]>(
              `SELECT ${ITEM_COLUMNS} FROM items ${where}
               ORDER BY created_at ${way.sql}, id ${way.sql} LIMIT ?`,
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
        query: ActionQuery,
        page: OrderedPage,
      ): Promise<Slice<Action>> => {
        const way = direction(page.order);

        const { rows, next } = keysetPage(page, (after, limit) => {
          const clauses: string[] = [];
          const params: Bindable[] = [];

          if (query.item !== undefined) {
            clauses.push("subject = ?");
            params.push(query.item);
          }
          if (after !== undefined) {
            const keyset = keysetClause("at", after, way.comparison);
            clauses.push(keyset.sql);
            params.push(...keyset.params);
          }

          const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
          params.push(limit);

          return source
            .query<ActionRow, Bindable[]>(
              `SELECT id, kind, subject, by_kind, by_ref, at, detail FROM actions
               ${where} ORDER BY at ${way.sql}, id ${way.sql} LIMIT ?`,
            )
            .all(...params);
        });

        return {
          values: rows.map(toAction),
          ...(next === undefined ? {} : { next }),
        };
      },
    };
  }

  const committed = on(false);
  const uncommitted = on(true);

  /** Built per transaction, because every method has to consult that transaction's fence. */
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
      artifacts: guard(uncommitted.artifacts),
      routingRecords: guard(uncommitted.routingRecords),
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
        jobs.enqueue(enqueued);
      }),

      leasedJob: guard(async (lease: LeaseId) => jobs.leasedJob(lease)),

      resolveJob: guard(
        async (lease: LeaseId, resolution: JobResolution): Promise<void> => {
          jobs.resolveJob(lease, resolution);
        },
      ),
    };
  }

  return {
    ...committed,
    ...notYetImplementedReads(),

    transaction: <T>(work: (handle: PoolTx) => Promise<T>): Promise<T> =>
      writes.transact((fence) => work(poolTx(fence))),

    claim: (request: ClaimRequest, now: Timestamp) =>
      writes.transact(async () => jobs.claim(request, now)),

    extendLease: (lease: LeaseId, until: Timestamp) =>
      writes.transact(async () => jobs.extendLease(lease, until)),

    releaseLease: (lease: LeaseId) =>
      writes.transact(async () => jobs.releaseLease(lease)),

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
    enrichmentStates: unimplemented("enrichmentStates"),
    unreferencedAssets: unimplemented("unreferencedAssets"),
    changesSince: unimplemented("changesSince"),
  };
}
