import { randomUUID } from "node:crypto";

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
  Destination,
  DestinationId,
  DestinationRecord,
  JobResolution,
  JobSubject,
  RememberedAnswer,
  RememberedRequest,
  DeliveryLanding,
  RoutingRecord,
  RoutingRecordId,
  RoutingTemplate,
  RoutingTemplateId,
  RoutingTemplateRecord,
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
  PoolIdentity,
  PoolStore,
  PoolTx,
  Position,
  ReadOrder,
  Slice,
  SourceId,
  SourceUse,
  Tag,
  TagName,
  TagUse,
  Timestamp,
  WorkQueue,
  WorkWithdrawal,
} from "@notemap/core";

import {
  agentColumns,
  destinationParams,
  itemParams,
  routingRecordParams,
  routingTemplateParams,
  toAction,
  toAsset,
  toDestination,
  toItem,
  toMillis,
  toRoutingRecord,
  toRoutingSummary,
  toRoutingTemplate,
  toTimestamp,
} from "./mapping";
import { poolIdentity } from "./identity";
import { abandonedWork, jobQueue } from "./jobs";
import { LAST_MODIFIED_AT, MIGRATIONS } from "./migrations";
import type {
  ActionRow,
  AssetRow,
  DestinationRow,
  ItemAssetJoinRow,
  ItemRoutingRow,
  ItemRow,
  ItemTagRow,
  PoolMetaRow,
  RoutingRecordRow,
  RoutingTemplateRow,
  SourceUseRow,
  TagUseRow,
} from "./rows";
import {
  migrate,
  openDatabase,
  placeholders,
  statements,
  type Bindable,
} from "@notemap/sqlite";
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
  payload_metadata, created_at, utc_offset, content_updated_at, modified_at,
  revision_of, archived_at, archive_reason
`;

const ASSET_COLUMNS = `id, filename, mime, blob, bytes, stored_at`;

const DESTINATION_COLUMNS = `
  id, name, kind, settings, retired_at, created_at, modified_at
`;

const ROUTING_COLUMNS = `
  id, item_id, target_kind, destination, capability, note, arguments, state,
  at, pointer, url, output_blob, output_mime, output_note, template_id,
  fired_by_tag
`;

/**
 * What a template is, and what the pool made from it. The two counts are a
 * correlated subquery rather than a join and a group: a template with no
 * records still has to answer, and a `LEFT JOIN … GROUP BY` over ten templates
 * reads every routing record to say so.
 */
const TEMPLATE_COLUMNS = `
  id, name, destination_id, capability, arguments, folder, trigger_tag,
  established_at, created_at, modified_at
`;

/**
 * The columns above, and what this template's **tag** filed beside them.
 * `fired_by_tag` is the filter rather than an afterthought: a template taken by
 * hand in the composer was applied, not fired, and a row saying "last fired"
 * about somebody's own decision says the wrong thing in the project's own words.
 */
const TEMPLATE_READ = `
  ${TEMPLATE_COLUMNS},
  (SELECT COUNT(*) FROM routing_records r
     WHERE r.template_id = routing_templates.id AND r.fired_by_tag = 1)
    AS fired_records,
  (SELECT MAX(at) FROM routing_records r
     WHERE r.template_id = routing_templates.id AND r.fired_by_tag = 1)
    AS fired_last_at
`;

/** What every surface orders on: capture time, and the id only to break a tie. */
const CAPTURE_KEY = `created_at`;

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

/** However much history a pool accumulates, past this the list is a search problem. */
const REMEMBERED_LIMIT = 50;

/** `json_extract` answers whatever the arguments held, so the value is narrowed on the way out. */
type RememberedRow = {
  readonly value: unknown;
  readonly uses: number;
  readonly last_at: number;
};

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
 * same thing: SQLite seeks straight to the position, where the `OR` form scans
 * the index from the end and costs a page its offset in rows.
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
  const database = openDatabase({
    file: config.file,
    busyTimeoutMs: BUSY_TIMEOUT_MS,
    foreignKeys: true,
    reader: true,
  });
  const { writer, reader } = database;
  let shut = false;
  let identity: PoolIdentity;
  try {
    migrate(writer, MIGRATIONS, "pool");
    identity = poolIdentity(writer);
  } catch (cause) {
    // A store that failed to open leaves the caller no connection to close.
    database.close();
    throw cause;
  }

  const write = statements(writer);
  const read = statements(reader);
  const writes = writeLock(writer, config.transactionTimeoutMs);
  const clock = config.clock ?? systemClock;

  const insertItem = write.query(`
    INSERT INTO items (${ITEM_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
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
  /**
   * An output is named by a routing record rather than by an asset, and the two
   * may be the same bytes — so releasing the last asset that named a blob does
   * not make it the sweep's to take.
   */
  const namedAsOutput = write.query<{ output_blob: string }, [string]>(
    `SELECT output_blob FROM routing_records WHERE output_blob = ? LIMIT 1`,
  );
  const insertDestination = write.query<
    never,
    ReturnType<typeof destinationParams>
  >(`
    INSERT INTO destinations (${DESTINATION_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateDestination = write.query<
    never,
    [string, string, string, number | null, number, number, string]
  >(`
    UPDATE destinations
    SET name = ?, kind = ?, settings = ?, retired_at = ?, created_at = ?,
        modified_at = ?
    WHERE id = ?
  `);
  const deleteDestination = write.query<never, [string]>(
    `DELETE FROM destinations WHERE id = ?`,
  );
  const insertTemplate = write.query<
    never,
    ReturnType<typeof routingTemplateParams>
  >(`
    INSERT INTO routing_templates (${TEMPLATE_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateTemplate = write.query<
    never,
    [
      string,
      string,
      string,
      string,
      string,
      string | null,
      number | null,
      number,
      number,
      string,
    ]
  >(`
    UPDATE routing_templates
    SET name = ?, destination_id = ?, capability = ?, arguments = ?, folder = ?,
        trigger_tag = ?, established_at = ?, created_at = ?, modified_at = ?
    WHERE id = ?
  `);
  const deleteTemplate = write.query<never, [string]>(
    `DELETE FROM routing_templates WHERE id = ?`,
  );
  const insertRouting = write.query<
    never,
    ReturnType<typeof routingRecordParams>
  >(`
    INSERT INTO routing_records (${ROUTING_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deliverRouting = write.query<
    never,
    [
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string,
    ]
  >(`
    UPDATE routing_records
    SET state = 'delivered', pointer = ?, url = ?, output_blob = ?,
        output_mime = ?, output_note = ?
    WHERE id = ?
  `);
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
      `SELECT ${ITEM_COLUMNS} FROM items
       WHERE source_id = ? AND source_item_id = ?`,
    );
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
    const tagsInUse = source.query<TagUseRow, []>(`
      SELECT name, COUNT(*) AS items
      FROM item_tags
      GROUP BY name
      ORDER BY items DESC, name ASC
    `);
    /**
     * By capture time rather than by arrival: a relay posting a backlog would
     * otherwise put itself at the top for as long as the backlog reaches back.
     */
    const sourcesInUse = source.query<SourceUseRow, []>(`
      SELECT source_id, COUNT(*) AS items, MAX(created_at) AS last_captured_at
      FROM items
      GROUP BY source_id
      ORDER BY last_captured_at DESC, source_id ASC
    `);
    const routingFor = source.query<RoutingRecordRow, [string]>(
      `SELECT ${ROUTING_COLUMNS} FROM routing_records
       WHERE item_id = ? ORDER BY at, id`,
    );
    const routingById = source.query<RoutingRecordRow, [string]>(
      `SELECT ${ROUTING_COLUMNS} FROM routing_records WHERE id = ?`,
    );

    /**
     * What a field has held on one destination, and how much. A `delivered`
     * record counts outright; a `pending` one counts unless its delivery was
     * abandoned — a reservation still being retried is a place somebody is
     * using, and one that was given up on is not. That is the whole reason this
     * reaches `jobs` rather than reading records alone.
     *
     * One past the cap is read so `truncated` can be answered without counting
     * the whole history.
     *
     * The field is quoted into the JSON path rather than concatenated bare: a
     * name holding a `.` would otherwise walk into a nested object, and one
     * holding a `-` would match nothing and say so as an empty answer.
     */
    const rememberedPlaces = source.query<
      RememberedRow,
      [string, string, string, string, number]
    >(
      `SELECT json_extract(r.arguments, '$."' || ? || '"') AS value,
              COUNT(*) AS uses,
              MAX(r.at) AS last_at
         FROM routing_records r
        WHERE r.destination = ?
          AND r.capability = ?
          AND r.target_kind = 'destination'
          AND json_extract(r.arguments, '$."' || ? || '"') IS NOT NULL
          AND (r.state = 'delivered'
               OR NOT EXISTS (SELECT 1 FROM jobs j
                               WHERE j.kind = 'delivery'
                                 AND j.subject_kind = 'routing-record'
                                 AND j.subject_id = r.id
                                 AND j.abandoned_at IS NOT NULL))
        GROUP BY value
        ORDER BY uses DESC, last_at DESC, value
        LIMIT ?`,
    );
    const everyDestination = source.query<DestinationRow, []>(
      `SELECT ${DESTINATION_COLUMNS} FROM destinations
       ORDER BY created_at, id`,
    );
    const destinationById = source.query<DestinationRow, [string]>(
      `SELECT ${DESTINATION_COLUMNS} FROM destinations WHERE id = ?`,
    );
    /** A reservation counts as much as a delivered record: both name it. */
    const namedBy = source.query<{ one: number }, [string]>(
      `SELECT 1 AS one FROM routing_records WHERE destination = ? LIMIT 1`,
    );
    const everyTemplate = source.query<RoutingTemplateRow, []>(
      `SELECT ${TEMPLATE_READ} FROM routing_templates
       ORDER BY created_at, id`,
    );
    const templateById = source.query<RoutingTemplateRow, [string]>(
      `SELECT ${TEMPLATE_READ} FROM routing_templates WHERE id = ?`,
    );
    const templateByTag = source.query<RoutingTemplateRow, [string]>(
      `SELECT ${TEMPLATE_READ} FROM routing_templates WHERE trigger_tag = ?`,
    );
    const templatesNaming = source.query<RoutingTemplateRow, [string]>(
      `SELECT ${TEMPLATE_READ} FROM routing_templates
       WHERE destination_id = ?
       ORDER BY created_at, id`,
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
        .query<ItemAssetJoinRow, Bindable[]>(
          `SELECT reference.item_id, reference.slot, reference.asset_id,
                  asset.filename, asset.mime, asset.blob, asset.bytes
           FROM item_assets AS reference
           JOIN assets AS asset ON asset.id = reference.asset_id
           WHERE reference.item_id IN (${slots}) ORDER BY reference.slot`,
        )
        .all(...ids);
      const revisionRows = source
        .query<{ id: string; revision_of: string }, Bindable[]>(
          `SELECT id, revision_of FROM items WHERE revision_of IN (${slots})
           ORDER BY created_at, id`,
        )
        .all(...ids);
      const routingRows = source
        .query<ItemRoutingRow, Bindable[]>(
          `SELECT item_id, target_kind, destination, state FROM routing_records
           WHERE item_id IN (${slots}) ORDER BY at, id`,
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
      const routing = group(routingRows);

      const revisedInto = new Map<string, string[]>();
      for (const row of revisionRows) {
        const made = revisedInto.get(row.revision_of);
        if (made) made.push(row.id);
        else revisedInto.set(row.revision_of, [row.id]);
      }

      return rows.map((row) =>
        toItem(
          row,
          tags.get(row.id) ?? [],
          assets.get(row.id) ?? [],
          revisedInto.get(row.id) ?? [],
          toRoutingSummary(routing.get(row.id) ?? []),
        ),
      );
    }

    function one(row: ItemRow | undefined): Item | undefined {
      return row === undefined ? undefined : hydrate([row])[0];
    }

    function byCaptureTime(page: OrderedPage, where?: string): Slice<Item> {
      const way = direction(page.order);

      const { rows, next } = keysetPage(page, (after, limit) => {
        const keyset =
          after === undefined
            ? undefined
            : keysetClause(CAPTURE_KEY, after, way.comparison);
        const clauses = [
          ...(where === undefined ? [] : [where]),
          ...(keyset === undefined ? [] : [keyset.sql]),
        ];
        const params: Bindable[] = [...(keyset?.params ?? []), limit];

        return source
          .query<ItemRow & { at: number }, Bindable[]>(
            `SELECT ${ITEM_COLUMNS}, ${CAPTURE_KEY} AS at FROM items AS item
             ${clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`}
             ORDER BY ${CAPTURE_KEY} ${way.sql}, id ${way.sql} LIMIT ?`,
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

      tagsInUse: async (): Promise<readonly TagUse[]> =>
        tagsInUse.all().map((row) => ({
          name: row.name as TagName,
          items: row.items,
        })),

      sourcesInUse: async (): Promise<readonly SourceUse[]> =>
        sourcesInUse.all().map((row) => ({
          id: row.source_id as SourceId,
          items: row.items,
          lastCapturedAt: toTimestamp(row.last_captured_at),
        })),

      routingRecords: async (item: ItemId): Promise<readonly RoutingRecord[]> =>
        routingFor.all(item).map(toRoutingRecord),

      routingRecord: async (
        id: RoutingRecordId,
      ): Promise<RoutingRecord | undefined> => {
        const row = routingById.get(id);
        return row === undefined ? undefined : toRoutingRecord(row);
      },

      remembered: async (
        request: RememberedRequest,
      ): Promise<RememberedAnswer> => {
        const rows = rememberedPlaces.all(
          request.field,
          request.destination,
          request.capability,
          request.field,
          REMEMBERED_LIMIT + 1,
        );

        return {
          truncated: rows.length > REMEMBERED_LIMIT,
          places: rows.slice(0, REMEMBERED_LIMIT).map((row) => ({
            value: String(row.value),
            uses: row.uses,
            lastAt: toTimestamp(row.last_at),
          })),
        };
      },

      destinations: async (): Promise<readonly Destination[]> =>
        everyDestination.all().map(toDestination),

      destination: async (
        id: DestinationId,
      ): Promise<Destination | undefined> => {
        const row = destinationById.get(id);
        return row === undefined ? undefined : toDestination(row);
      },

      destinationEverNamed: async (id: DestinationId): Promise<boolean> =>
        namedBy.get(id) !== undefined,

      routingTemplates: async (): Promise<readonly RoutingTemplate[]> =>
        everyTemplate.all().map(toRoutingTemplate),

      routingTemplate: async (
        id: RoutingTemplateId,
      ): Promise<RoutingTemplate | undefined> => {
        const row = templateById.get(id);
        return row === undefined ? undefined : toRoutingTemplate(row);
      },

      routingTemplateByTriggerTag: async (
        tag: TagName,
      ): Promise<RoutingTemplate | undefined> => {
        const row = templateByTag.get(tag);
        return row === undefined ? undefined : toRoutingTemplate(row);
      },

      routingTemplatesNaming: async (
        destination: DestinationId,
      ): Promise<readonly RoutingTemplate[]> =>
        templatesNaming.all(destination).map(toRoutingTemplate),

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

      feed: async (page: OrderedPage): Promise<Slice<Item>> =>
        byCaptureTime(page),

      queue: async (page: OrderedPage): Promise<Slice<Item>> =>
        byCaptureTime(page, QUEUED),

      archived: async (page: OrderedPage): Promise<Slice<Item>> =>
        byCaptureTime(page, ARCHIVED),

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

  async function readDestinationBack(id: DestinationId): Promise<Destination> {
    const stored = await uncommitted.destination(id);
    if (stored === undefined) {
      throw new Error(`no destination ${id} to read back`);
    }
    return stored;
  }

  async function readTemplateBack(
    id: RoutingTemplateId,
  ): Promise<RoutingTemplate> {
    const stored = await uncommitted.routingTemplate(id);
    if (stored === undefined) {
      throw new Error(`no routing template ${id} to read back`);
    }
    return stored;
  }

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
      tagsInUse: guard(uncommitted.tagsInUse),
      sourcesInUse: guard(uncommitted.sourcesInUse),
      routingRecords: guard(uncommitted.routingRecords),
      routingRecord: guard(uncommitted.routingRecord),
      remembered: guard(uncommitted.remembered),
      destinations: guard(uncommitted.destinations),
      destination: guard(uncommitted.destination),
      destinationEverNamed: guard(uncommitted.destinationEverNamed),
      routingTemplates: guard(uncommitted.routingTemplates),
      routingTemplate: guard(uncommitted.routingTemplate),
      routingTemplateByTriggerTag: guard(
        uncommitted.routingTemplateByTriggerTag,
      ),
      routingTemplatesNaming: guard(uncommitted.routingTemplatesNaming),
      itemBySourceIdentity: guard(uncommitted.itemBySourceIdentity),
      feed: guard(uncommitted.feed),
      queue: guard(uncommitted.queue),
      archived: guard(uncommitted.archived),
      actions: guard(uncommitted.actions),
      asset: guard(uncommitted.asset),
      unreferencedAssets: guard(uncommitted.unreferencedAssets),

      insertItem: guard(async (record: ItemRecord): Promise<Item> => {
        insertItem.run(...itemParams(record, nextModifiedAt()));

        if (record.revisionOf !== undefined) {
          // Being revised takes the item it came from out of the queue, which a
          // delta read that missed it would leave a client still showing.
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

          // An amendment may drop a slot as readily as add one.
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

      insertDestination: guard(
        async (record: DestinationRecord): Promise<Destination> => {
          insertDestination.run(...destinationParams(record, nextModifiedAt()));
          return readDestinationBack(record.id);
        },
      ),

      updateDestination: guard(
        async (record: DestinationRecord): Promise<Destination> => {
          const [id, ...rest] = destinationParams(record, nextModifiedAt());
          updateDestination.run(...rest, id);
          return readDestinationBack(record.id);
        },
      ),

      /** The foreign key refuses one a record names, which is the rule itself. */
      deleteDestination: guard(async (id: DestinationId): Promise<void> => {
        deleteDestination.run(id);
      }),

      insertRoutingTemplate: guard(
        async (record: RoutingTemplateRecord): Promise<RoutingTemplate> => {
          insertTemplate.run(
            ...routingTemplateParams(record, nextModifiedAt()),
          );
          return readTemplateBack(record.id);
        },
      ),

      updateRoutingTemplate: guard(
        async (record: RoutingTemplateRecord): Promise<RoutingTemplate> => {
          const [id, ...rest] = routingTemplateParams(record, nextModifiedAt());
          updateTemplate.run(...rest, id);
          return readTemplateBack(record.id);
        },
      ),

      /** No foreign key stands in the way: a record keeps what it routed as. */
      deleteRoutingTemplate: guard(
        async (id: RoutingTemplateId): Promise<void> => {
          deleteTemplate.run(id);
        },
      ),

      insertRoutingRecord: guard(
        async (record: RoutingRecord): Promise<void> => {
          insertRouting.run(...routingRecordParams(record));
          // Routing is a change to the item, and a delta read has to carry it.
          touchItem.run(nextModifiedAt(), record.item);
        },
      ),

      resolveRoutingRecord: guard(
        async (
          record: RoutingRecordId,
          landing: DeliveryLanding,
        ): Promise<void> => {
          const row = routingItem.get(record);
          if (row === undefined) {
            throw new Error(`no routing record ${record} to resolve`);
          }

          const output = landing.output;
          deliverRouting.run(
            landing.pointer ?? null,
            landing.url ?? null,
            output?.content?.blob ?? null,
            output?.content?.mediaType ?? null,
            output?.note ?? null,
            record,
          );
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
            .filter(
              (blob) =>
                stillNamed.get(blob) === undefined &&
                namedAsOutput.get(blob) === undefined,
            )
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

    identity: () => Promise.resolve(identity),

    transaction: <T>(work: (handle: PoolTx) => Promise<T>): Promise<T> =>
      writes.transact((fence) => work(poolTx(fence))),

    claim: (request: ClaimRequest, now: Timestamp) =>
      writes.transact(async () => jobs.claim(request, now)),

    extendLease: (lease: LeaseId, until: Timestamp) =>
      writes.transact(async () => jobs.extendLease(lease, until)),

    releaseLease: (lease: LeaseId) =>
      writes.transact(async () => jobs.releaseLease(lease)),

    /**
     * A host closes on the signal it was sent, and may be sent it twice, or
     * close on an error path and again on the way out. The second close is the
     * same statement as the first, so it answers rather than throwing.
     */
    close: async () => {
      if (shut) return;
      shut = true;

      database.close();
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
    tombstone: unimplemented("tombstone"),
    suggestions: unimplemented("suggestions"),
    suggestion: unimplemented("suggestion"),
    enrichmentStates: unimplemented("enrichmentStates"),
    changesSince: unimplemented("changesSince"),
  };
}
