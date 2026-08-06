import type { DatabaseSync } from "node:sqlite";

/**
 * Applied in order, tracked by `PRAGMA user_version`. Never edited once it has
 * run anywhere real — a new statement goes in a new migration.
 *
 * Timestamps are epoch milliseconds rather than the RFC 3339 text they are in
 * the domain. Two sources may spell one instant `09:00:00Z` and `09:00:00.000Z`,
 * and those sort half a second apart in the wrong order as text, which would
 * break feed order. Sub-millisecond precision does not survive the round trip.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE items (
    id                 TEXT    NOT NULL PRIMARY KEY,
    -- No foreign key to a sources table, because there is none: sources are
    -- configuration core is handed, not rows it owns.
    source_id          TEXT    NOT NULL,
    source_item_id     TEXT    NOT NULL,
    payload_type       TEXT    NOT NULL,
    payload_content    TEXT    NOT NULL,
    payload_metadata   TEXT    NOT NULL,
    created_at         INTEGER NOT NULL,
    content_updated_at INTEGER,
    modified_at        INTEGER NOT NULL,
    revision_of        TEXT    REFERENCES items (id),
    archived_at        INTEGER,
    archive_reason     TEXT
  ) STRICT;

  -- Only captures claim a source identity. A revision is a new item but not a
  -- new capture from a source, so it carries the identity of the capture it
  -- revises and is exempt: the rule exists so re-reading a source cannot
  -- duplicate, and a revision never came from a source at all.
  CREATE UNIQUE INDEX items_source_identity
    ON items (source_id, source_item_id)
    WHERE revision_of IS NULL;

  -- At most one revision per item, so the revision chain cannot fork.
  CREATE UNIQUE INDEX items_one_revision_each
    ON items (revision_of)
    WHERE revision_of IS NOT NULL;

  CREATE INDEX items_feed        ON items (created_at, id);
  CREATE INDEX items_modified_at ON items (modified_at);

  CREATE TABLE item_tags (
    item_id  TEXT    NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    name     TEXT    NOT NULL,
    by_kind  TEXT    NOT NULL CHECK (by_kind IN ('person', 'provider', 'source')),
    -- A person is anonymous; a provider or source is named. The mapper reads
    -- by_ref back on exactly that assumption, so the row may not break it.
    by_ref   TEXT    CHECK ((by_kind = 'person') = (by_ref IS NULL)),
    added_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, name)
  ) STRICT;

  -- An item's references to assets, which is also the count deciding when an
  -- asset may be released. The reference exists from the moment the capture
  -- commits, so a client that uploads and then crashes leaks space rather than
  -- leaving a reference to a capture that never arrived.
  CREATE TABLE item_assets (
    item_id  TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    slot     TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    -- What the capture expected, so a swapped asset is caught rather than served.
    hash     TEXT NOT NULL,
    PRIMARY KEY (item_id, slot)
  ) STRICT;

  CREATE INDEX item_assets_asset ON item_assets (asset_id);

  CREATE TABLE jobs (
    id          TEXT    NOT NULL PRIMARY KEY,
    kind        TEXT    NOT NULL CHECK (kind IN ('enrichment', 'mirror')),
    subject     TEXT    NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    enrichment  TEXT,
    attempt     INTEGER NOT NULL,
    enqueued_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX jobs_claimable ON jobs (kind, enqueued_at);

  -- No foreign key to items, and so no cascade: purging an item does not clear
  -- its log entries. Erasing the trace of what happened is a separate operation
  -- from erasing the material.
  CREATE TABLE actions (
    id      TEXT    NOT NULL PRIMARY KEY,
    kind    TEXT    NOT NULL,
    subject TEXT,
    by_kind TEXT    NOT NULL CHECK (by_kind IN ('person', 'provider', 'source')),
    by_ref  TEXT    CHECK ((by_kind = 'person') = (by_ref IS NULL)),
    at      INTEGER NOT NULL,
    detail  TEXT    NOT NULL
  ) STRICT;

  CREATE INDEX actions_subject ON actions (subject, at);
  CREATE INDEX actions_at      ON actions (at);

  -- \`modified_at\` must increase strictly, or a client's delta read can skip a
  -- write that committed while its cursor sat on the same millisecond. The last
  -- value issued is kept here rather than read back from \`items\`, which purge
  -- would otherwise be able to lower.
  CREATE TABLE pool_meta (
    key   TEXT    NOT NULL PRIMARY KEY,
    value INTEGER NOT NULL
  ) STRICT;
  `,
];

export const LAST_MODIFIED_AT = "last_modified_at";

export function migrate(connection: DatabaseSync): void {
  const applied = (
    connection.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  if (applied > MIGRATIONS.length) {
    throw new Error(
      `pool was written by a newer notemap: schema version ${applied}, this build knows ${MIGRATIONS.length}`,
    );
  }

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    try {
      // `user_version` takes no parameter binding, and the value is a loop
      // counter rather than anything a caller supplies.
      connection.exec(
        `BEGIN IMMEDIATE; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`,
      );
    } catch (cause) {
      try {
        // A failure mid-script leaves its transaction open on the connection.
        connection.exec("ROLLBACK");
      } catch {
        // It failed before BEGIN, or SQLite already rolled back on its own.
      }
      throw cause;
    }
  }
}
