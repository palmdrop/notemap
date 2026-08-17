import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  AbandonedPosition,
  Action,
  ActionQuery,
  ArchiveState,
  Artifact,
  Asset,
  AssetId,
  BlobHash,
  ClaimRequest,
  Clock,
  JobResolution,
  JobSubject,
  RoutingRecord,
  RoutingRecordId,
  IdGenerator,
  Item,
  ItemId,
  ItemRecord,
  Job,
  LeaseId,
  MintableId,
  OrderedPage,
  Page,
  Payload,
  PoolStore,
  PoolTx,
  Position,
  ReadOrder,
  Slice,
  SourceId,
  Tag,
  TagName,
  Timestamp,
  WorkQueue,
  WorkWithdrawal,
} from "@notemap/core";

import {
  agentColumns,
  itemParams,
  routingRecordParams,
  toAction,
  toAsset,
  toItem,
  toMillis,
  toRoutingRecord,
  toTimestamp,
} from "./mapping";
import { abandonedWork, jobQueue } from "./jobs";
import { LAST_MODIFIED_AT, migrate } from "./migrations";
import type {
  ActionRow,
  AssetRow,
  ChainColumns,
  ItemAssetRow,
  ItemRow,
  ItemTagRow,
  PoolMetaRow,
  RoutingRecordRow,
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

/**
 * What orders the feed beside `created_at`, which a revision shares with the
 * item it supersedes. The link places one after the other; an id may not.
 */
const CHAIN_COLUMNS = `root_id, revision_depth`;

/** Total on its own: one row is one place in one chain. */
const FEED_KEY = `created_at, root_id, revision_depth`;

const ASSET_COLUMNS = `id, filename, mime, blob, bytes, stored_at`;

const ROUTING_COLUMNS = `
  id, item_id, target_kind, destination, capability, note, target, state, at,
  pointer
`;

/** What the queue and the archive order on: last touch of content, never of state. */
const CONTENT_TIME = `COALESCE(content_updated_at, created_at)`;

const QUEUED = `
  item.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM items AS revision WHERE revision.revision_of = item.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM routing_records AS routed WHERE routed.item_id = item.id
  )
`;

const ARCHIVED = `item.archived_at IS NOT NULL`;

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
 * same thing: SQLite seeks straight to the position on plain columns, where the
 * `OR` form scans the index from the end and costs a page its offset in rows.
 * On an expression index — the queue's and the archive's — neither seeks.
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
    INSERT INTO items (${ITEM_COLUMNS}, root_id, revision_depth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const chainOf = write.query<ChainColumns, [string]>(
    `SELECT ${CHAIN_COLUMNS} FROM items WHERE id = ?`,
  );
  const amend = write.query<
    never,
    [string, string, string, number, number, string]
  >(`
    UPDATE items
    SET payload_type = ?, payload_content = ?, payload_metadata = ?,
        content_updated_at = ?, modified_at = ?
    WHERE id = ?
  `);
  const dropReferences = write.query<never, [string]>(
    `DELETE FROM item_assets WHERE item_id = ?`,
  );
  const insertTag = write.query(`
    INSERT INTO item_tags (item_id, name, by_kind, by_ref, added_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const deleteTag = write.query<never, [string, string]>(
    `DELETE FROM item_tags WHERE item_id = ? AND name = ?`,
  );
  const insertReference = write.query(`
    INSERT INTO item_assets (item_id, slot, asset_id) VALUES (?, ?, ?)
  `);
  const insertAsset = write.query<
    never,
    [string, string, string, string, number, number]
  >(`
    INSERT INTO assets (id, filename, mime, blob, bytes, stored_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const deleteAsset = write.query<never, [string]>(
    `DELETE FROM assets WHERE id = ?`,
  );
  const stillNamed = write.query<{ blob: string }, [string]>(
    `SELECT blob FROM assets WHERE blob = ? LIMIT 1`,
  );
  const insertRouting = write.query<
    never,
    ReturnType<typeof routingRecordParams>
  >(`
    INSERT INTO routing_records (${ROUTING_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deliverRouting = write.query<never, [string | null, string]>(
    `UPDATE routing_records SET state = 'delivered', pointer = ? WHERE id = ?`,
  );
  const deleteRouting = write.query<never, [string]>(
    `DELETE FROM routing_records WHERE id = ?`,
  );
  /** Read before a removal, so the item can still be touched after the record goes. */
  const routingItem = write.query<{ item_id: string }, [string]>(
    `SELECT item_id FROM routing_records WHERE id = ?`,
  );
  const setArchive = write.query<
    never,
    [number | null, string | null, number, string]
  >(`
    UPDATE items SET archived_at = ?, archive_reason = ?, modified_at = ?
    WHERE id = ?
  `);
  const touchItem = write.query<never, [number, string]>(
    `UPDATE items SET modified_at = ? WHERE id = ?`,
  );
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

  /** Where a row sits in its revision chain, taken from the one it revises. */
  function chain(record: ItemRecord): ChainColumns {
    if (record.revisionOf === undefined) {
      return { root_id: record.id, revision_depth: 0 };
    }

    const original = chainOf.get(record.revisionOf);
    if (original === undefined) {
      throw new Error(`no item ${record.revisionOf} to revise`);
    }

    return {
      root_id: original.root_id,
      revision_depth: original.revision_depth + 1,
    };
  }

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
      `SELECT ${ITEM_COLUMNS} FROM items
       ORDER BY created_at DESC, root_id DESC, revision_depth DESC LIMIT 1`,
    );
    const chainAt = source.query<ChainColumns, [string]>(
      `SELECT ${CHAIN_COLUMNS} FROM items WHERE id = ?`,
    );

    /**
     * The feed continues from a position naming a row, and orders on a key that
     * row carries. A row that has since gone is read as the root of its own
     * chain, which is what it was unless it was a revision — and a purge that
     * took one took the chain with it, so nothing better is left to read.
     */
    function feedKeyset(
      after: Bound,
      comparison: "<" | ">",
    ): { readonly sql: string; readonly params: Bindable[] } {
      if (after.id === undefined) {
        return { sql: `created_at ${comparison} ?`, params: [after.at] };
      }

      const chain = chainAt.get(after.id) ?? {
        root_id: after.id,
        revision_depth: 0,
      };

      return {
        sql: `(${FEED_KEY}) ${comparison} (?, ?, ?)`,
        params: [after.at, chain.root_id, chain.revision_depth],
      };
    }
    const assetById = source.query<AssetRow, [string]>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE id = ?`,
    );
    /**
     * The sweep's subject: stored long enough ago that "just uploaded" is not
     * mistaken for "abandoned", and named by no item at all — not by an item
     * that has gone, which is purge's, but by none that ever arrived.
     */
    const unreferenced = source.query<{ id: string }, [number, number]>(`
      SELECT id FROM assets
      WHERE stored_at < ?
        AND NOT EXISTS (SELECT 1 FROM item_assets WHERE asset_id = assets.id)
      ORDER BY stored_at, id
      LIMIT ?
    `);
    const routingFor = source.query<RoutingRecordRow, [string]>(
      `SELECT ${ROUTING_COLUMNS} FROM routing_records
       WHERE item_id = ? ORDER BY at, id`,
    );
    const routingById = source.query<RoutingRecordRow, [string]>(
      `SELECT ${ROUTING_COLUMNS} FROM routing_records WHERE id = ?`,
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
          `SELECT item_id, slot, asset_id FROM item_assets
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

    function byContentTime(page: OrderedPage, where: string): Slice<Item> {
      const way = direction(page.order);

      const { rows, next } = keysetPage(page, (after, limit) => {
        const keyset =
          after === undefined
            ? undefined
            : keysetClause(CONTENT_TIME, after, way.comparison);
        const clauses = [where, ...(keyset === undefined ? [] : [keyset.sql])];
        const params: Bindable[] = [...(keyset?.params ?? []), limit];

        return source
          .query<ItemRow & { at: number }, Bindable[]>(
            `SELECT ${ITEM_COLUMNS}, ${CONTENT_TIME} AS at FROM items AS item
             WHERE ${clauses.join(" AND ")}
             ORDER BY ${CONTENT_TIME} ${way.sql}, id ${way.sql} LIMIT ?`,
          )
          .all(...params);
      });

      return { values: hydrate(rows), ...(next === undefined ? {} : { next }) };
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

      // No table yet, so empty is what an item genuinely has.
      artifacts: async (): Promise<readonly Artifact[]> => [],

      routingRecords: async (item: ItemId): Promise<readonly RoutingRecord[]> =>
        routingFor.all(item).map(toRoutingRecord),

      routingRecord: async (
        id: RoutingRecordId,
      ): Promise<RoutingRecord | undefined> => {
        const row = routingById.get(id);
        return row === undefined ? undefined : toRoutingRecord(row);
      },

      asset: async (id: AssetId): Promise<Asset | undefined> => {
        const row = assetById.get(id);
        return row === undefined ? undefined : toAsset(row);
      },

      unreferencedAssets: async (
        olderThan: Timestamp,
        limit: number,
      ): Promise<readonly AssetId[]> =>
        unreferenced
          .all(toMillis(olderThan), limit)
          .map((row) => row.id as AssetId),

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
            after === undefined ? undefined : feedKeyset(after, way.comparison);
          const where = keyset === undefined ? "" : `WHERE ${keyset.sql}`;
          const params: Bindable[] = [...(keyset?.params ?? []), limit];

          return source
            .query<ItemRow, Bindable[]>(
              `SELECT ${ITEM_COLUMNS} FROM items ${where}
               ORDER BY created_at ${way.sql}, root_id ${way.sql},
                        revision_depth ${way.sql} LIMIT ?`,
            )
            .all(...params)
            .map((row) => ({ ...row, at: row.created_at }));
        });

        return {
          values: hydrate(rows),
          ...(next === undefined ? {} : { next }),
        };
      },

      queue: async (page: OrderedPage): Promise<Slice<Item>> =>
        byContentTime(page, QUEUED),

      archived: async (page: OrderedPage): Promise<Slice<Item>> =>
        byContentTime(page, ARCHIVED),

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

    /** A change to an item that owns no column of its own, then the row it left. */
    async function touched(item: ItemId, what: string): Promise<Item> {
      touchItem.run(nextModifiedAt(), item);

      const stored = await uncommitted.item(item);
      if (stored === undefined) throw new Error(`no item ${item} to ${what}`);
      return stored;
    }

    return {
      ...notYetImplementedReads(),

      item: guard(uncommitted.item),
      artifacts: guard(uncommitted.artifacts),
      routingRecords: guard(uncommitted.routingRecords),
      routingRecord: guard(uncommitted.routingRecord),
      itemBySourceIdentity: guard(uncommitted.itemBySourceIdentity),
      head: guard(uncommitted.head),
      feed: guard(uncommitted.feed),
      queue: guard(uncommitted.queue),
      archived: guard(uncommitted.archived),
      actions: guard(uncommitted.actions),
      asset: guard(uncommitted.asset),
      unreferencedAssets: guard(uncommitted.unreferencedAssets),

      insertItem: guard(async (record: ItemRecord): Promise<Item> => {
        insertItem.run(...itemParams(record, nextModifiedAt(), chain(record)));

        if (record.revisionOf !== undefined) {
          // Being superseded is a change to the original — it leaves the queue
          // — and a delta read that missed it would leave a client showing work
          // that has moved on.
          touchItem.run(nextModifiedAt(), record.revisionOf);
        }

        for (const tag of record.tags) {
          insertTag.run(
            record.id,
            tag.name,
            ...agentColumns(tag.by),
            toMillis(tag.addedAt),
          );
        }

        for (const ref of record.payload.assets) {
          insertReference.run(record.id, ref.slot, ref.asset);
        }

        const stored = await uncommitted.item(record.id);
        if (stored === undefined) {
          throw new Error("the item just written could not be read back");
        }
        return stored;
      }),

      setArchiveState: guard(
        async (item: ItemId, state?: ArchiveState): Promise<Item> => {
          setArchive.run(
            state === undefined ? null : toMillis(state.archivedAt),
            state?.reason ?? null,
            nextModifiedAt(),
            item,
          );

          const stored = await uncommitted.item(item);
          if (stored === undefined) {
            throw new Error(`no item ${item} to set the archive state of`);
          }
          return stored;
        },
      ),

      amendItem: guard(
        async (
          item: ItemId,
          payload: Payload,
          at: Timestamp,
        ): Promise<Item> => {
          amend.run(
            payload.type,
            JSON.stringify(payload.content),
            JSON.stringify(payload.metadata),
            toMillis(at),
            nextModifiedAt(),
            item,
          );

          // Replaced rather than reconciled: the references are the payload's,
          // and an amendment may drop a slot as readily as add one.
          dropReferences.run(item);
          for (const ref of payload.assets) {
            insertReference.run(item, ref.slot, ref.asset);
          }

          const stored = await uncommitted.item(item);
          if (stored === undefined) throw new Error(`no item ${item} to amend`);
          return stored;
        },
      ),

      addTag: guard(async (item: ItemId, added: Tag): Promise<Item> => {
        insertTag.run(
          item,
          added.name,
          ...agentColumns(added.by),
          toMillis(added.addedAt),
        );
        return touched(item, "add a tag to");
      }),

      removeTag: guard(async (item: ItemId, name: TagName): Promise<Item> => {
        deleteTag.run(item, name);
        return touched(item, "remove a tag from");
      }),

      insertRoutingRecord: guard(
        async (record: RoutingRecord): Promise<void> => {
          insertRouting.run(...routingRecordParams(record));
          // Routing is a change to the item, and a delta read has to carry it.
          touchItem.run(nextModifiedAt(), record.item);
        },
      ),

      resolveRoutingRecord: guard(
        async (record: RoutingRecordId, pointer?: string): Promise<void> => {
          const row = routingItem.get(record);
          if (row === undefined) {
            throw new Error(`no routing record ${record} to resolve`);
          }

          deliverRouting.run(pointer ?? null, record);
          touchItem.run(nextModifiedAt(), row.item_id);
        },
      ),

      removeRoutingRecord: guard(
        async (record: RoutingRecordId): Promise<void> => {
          const row = routingItem.get(record);
          if (row === undefined) return;

          deleteRouting.run(record);
          // The item is back in the queue, which is a change a delta carries.
          touchItem.run(nextModifiedAt(), row.item_id);
        },
      ),

      withdrawWork: guard(
        async (subject: JobSubject): Promise<WorkWithdrawal> =>
          jobs.withdrawWork(subject),
      ),

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

      insertAsset: guard(async (asset: Asset): Promise<void> => {
        insertAsset.run(
          asset.id,
          asset.filename,
          asset.mime,
          asset.blob,
          asset.bytes,
          toMillis(clock.now()),
        );
      }),

      /**
       * The blobs, read before the deletes rather than after: afterwards there
       * is nothing left to say which blobs the departing assets named.
       */
      deleteAssets: guard(
        async (assets: readonly AssetId[]): Promise<readonly BlobHash[]> => {
          if (assets.length === 0) return [];

          const slots = placeholders(assets.length);
          const named = write
            .query<{ blob: string }, Bindable[]>(
              `SELECT DISTINCT blob FROM assets WHERE id IN (${slots})`,
            )
            .all(...assets);

          for (const asset of assets) deleteAsset.run(asset);

          return named
            .map((row) => row.blob)
            .filter((blob) => stillNamed.get(blob) === undefined)
            .map((blob) => blob as BlobHash);
        },
      ),

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
    suggestions: unimplemented("suggestions"),
    suggestion: unimplemented("suggestion"),
    enrichmentStates: unimplemented("enrichmentStates"),
    changesSince: unimplemented("changesSince"),
  };
}
