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

  `
  -- SQLite cannot drop a foreign key in place, and \`subject\` must lose the one
  -- it has: removing a purged item's mirror files is work about an item that no
  -- longer exists, so a cascade would delete the job that records the debt.
  CREATE TABLE jobs_next (
    id                  TEXT    NOT NULL PRIMARY KEY,
    kind                TEXT    NOT NULL
                        CHECK (kind IN ('enrichment', 'mirror', 'mirror-remove')),
    subject             TEXT    NOT NULL,
    -- An enrichment job that does not say which enrichment is meaningless, and
    -- nothing else has one to name.
    enrichment          TEXT    CHECK ((kind = 'enrichment') = (enrichment IS NOT NULL)),
    attempt             INTEGER NOT NULL,
    enqueued_at         INTEGER NOT NULL,
    -- Backoff: a job is invisible to \`claim\` until this passes.
    next_attempt_at     INTEGER NOT NULL,
    lease_id            TEXT,
    lease_expires_at    INTEGER CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
    abandoned_at        INTEGER,
    last_failure_code   TEXT,
    last_failure_detail TEXT
                        CHECK ((last_failure_code IS NULL) = (last_failure_detail IS NULL))
  ) STRICT;

  INSERT INTO jobs_next
    (id, kind, subject, enrichment, attempt, enqueued_at, next_attempt_at)
    SELECT id, kind, subject, enrichment, attempt, enqueued_at, enqueued_at FROM jobs;

  DROP TABLE jobs;
  ALTER TABLE jobs_next RENAME TO jobs;

  -- Coalescing, as a constraint rather than a convention: at most one *pending*
  -- mirror job per item. A mutation arriving while one is pending is absorbed by
  -- it, because that job writes current state when it runs; a mutation arriving
  -- while the only job is leased inserts, because this index does not cover
  -- leased rows and the host holding the lease has already read its state.
  --
  -- Neither leased nor abandoned counts as pending. An abandoned job records a
  -- failure for a person, not a write still to come, so holding a slot would
  -- make it swallow every write its item went on to owe.
  CREATE UNIQUE INDEX jobs_one_pending_mirror
    ON jobs (subject, kind)
    WHERE kind IN ('mirror', 'mirror-remove')
      AND lease_id IS NULL
      AND abandoned_at IS NULL;

  CREATE UNIQUE INDEX jobs_lease ON jobs (lease_id) WHERE lease_id IS NOT NULL;

  CREATE INDEX jobs_claimable ON jobs (kind, next_attempt_at, enqueued_at, id);
  CREATE INDEX jobs_subject   ON jobs (subject, kind);

  CREATE INDEX jobs_abandoned
    ON jobs (abandoned_at, subject, kind)
    WHERE abandoned_at IS NOT NULL;
  `,

  `
  -- Notemap is its own agent for work it drives rather than performs on anyone's
  -- behalf, and a CHECK cannot be widened in place. \`item_tags\` keeps the narrow
  -- set: a tag is always somebody's.
  CREATE TABLE actions_next (
    id      TEXT    NOT NULL PRIMARY KEY,
    kind    TEXT    NOT NULL,
    subject TEXT,
    by_kind TEXT    NOT NULL
            CHECK (by_kind IN ('notemap', 'person', 'provider', 'source')),
    by_ref  TEXT    CHECK ((by_kind IN ('notemap', 'person')) = (by_ref IS NULL)),
    at      INTEGER NOT NULL,
    detail  TEXT    NOT NULL
  ) STRICT;

  INSERT INTO actions_next SELECT id, kind, subject, by_kind, by_ref, at, detail FROM actions;

  DROP TABLE actions;
  ALTER TABLE actions_next RENAME TO actions;

  CREATE INDEX actions_subject ON actions (subject, at);
  CREATE INDEX actions_at      ON actions (at);
  `,

  `
  -- The log is now read from either end, and its keyset compares \`(at, id)\`.
  -- An index on \`at\` alone cannot answer that comparison: a read seeks on the
  -- prefix and then sorts every entry sharing an instant, which is every entry
  -- a single transaction appended.
  DROP INDEX actions_subject;
  DROP INDEX actions_at;

  CREATE INDEX actions_subject ON actions (subject, at, id);
  CREATE INDEX actions_at      ON actions (at, id);
  `,

  `
  -- A reference no longer carries the blob hash it expected, and SQLite cannot
  -- drop a column that a NOT NULL constraint stands on. With server-minted asset
  -- ids the hash was the client handing back a number it had just been given:
  -- a swapped asset resolves as an unknown one, and a corrupted blob agrees with
  -- the row, so it caught nothing the rest of the model does not.
  CREATE TABLE item_assets_next (
    item_id  TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    slot     TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    PRIMARY KEY (item_id, slot)
  ) STRICT;

  INSERT INTO item_assets_next SELECT item_id, slot, asset_id FROM item_assets;

  DROP TABLE item_assets;
  ALTER TABLE item_assets_next RENAME TO item_assets;

  CREATE INDEX item_assets_asset ON item_assets (asset_id);
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
