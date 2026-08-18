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
  -- A reference no longer carries a blob hash, and SQLite cannot drop a column
  -- that a NOT NULL constraint stands on.
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

  `
  -- \`stored_at\` is what the sweep's grace window is measured against.
  CREATE TABLE assets (
    id        TEXT    NOT NULL PRIMARY KEY,
    filename  TEXT    NOT NULL,
    mime      TEXT    NOT NULL,
    blob      TEXT    NOT NULL,
    bytes     INTEGER NOT NULL,
    stored_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX assets_blob      ON assets (blob);
  CREATE INDEX assets_stored_at ON assets (stored_at);

  -- SQLite cannot add a foreign key in place. It restricts rather than cascades:
  -- releasing an asset an item still references must fail loudly.
  CREATE TABLE item_assets_next (
    item_id  TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    slot     TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES assets (id),
    PRIMARY KEY (item_id, slot)
  ) STRICT;

  -- Nothing could mint an asset before this migration, so every existing row
  -- names one that never existed — which the foreign key forbids.
  INSERT INTO item_assets_next
    SELECT item_id, slot, asset_id FROM item_assets
    WHERE asset_id IN (SELECT id FROM assets);

  DROP TABLE item_assets;
  ALTER TABLE item_assets_next RENAME TO item_assets;

  CREATE INDEX item_assets_asset ON item_assets (asset_id);
  `,

  `
  -- A job says what kind of thing it is about as well as which one, and SQLite
  -- cannot split a column in place. Every existing job is about an item.
  CREATE TABLE jobs_next (
    id                  TEXT    NOT NULL PRIMARY KEY,
    kind                TEXT    NOT NULL
                        CHECK (kind IN ('enrichment', 'mirror', 'mirror-remove')),
    subject_kind        TEXT    NOT NULL CHECK (subject_kind IN ('item')),
    subject_id          TEXT    NOT NULL,
    enrichment          TEXT    CHECK ((kind = 'enrichment') = (enrichment IS NOT NULL)),
    attempt             INTEGER NOT NULL,
    enqueued_at         INTEGER NOT NULL,
    next_attempt_at     INTEGER NOT NULL,
    lease_id            TEXT,
    lease_expires_at    INTEGER CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
    abandoned_at        INTEGER,
    last_failure_code   TEXT,
    last_failure_detail TEXT
                        CHECK ((last_failure_code IS NULL) = (last_failure_detail IS NULL))
  ) STRICT;

  INSERT INTO jobs_next
    (id, kind, subject_kind, subject_id, enrichment, attempt, enqueued_at,
     next_attempt_at, lease_id, lease_expires_at, abandoned_at,
     last_failure_code, last_failure_detail)
    SELECT id, kind, 'item', subject, enrichment, attempt, enqueued_at,
           next_attempt_at, lease_id, lease_expires_at, abandoned_at,
           last_failure_code, last_failure_detail FROM jobs;

  DROP TABLE jobs;
  ALTER TABLE jobs_next RENAME TO jobs;

  -- Still at most one *pending* mirror job per item.
  CREATE UNIQUE INDEX jobs_one_pending_mirror
    ON jobs (subject_kind, subject_id, kind)
    WHERE kind IN ('mirror', 'mirror-remove')
      AND lease_id IS NULL
      AND abandoned_at IS NULL;

  CREATE UNIQUE INDEX jobs_lease ON jobs (lease_id) WHERE lease_id IS NOT NULL;

  CREATE INDEX jobs_claimable ON jobs (kind, next_attempt_at, enqueued_at, id);
  CREATE INDEX jobs_subject   ON jobs (subject_kind, subject_id, kind);

  CREATE INDEX jobs_abandoned
    ON jobs (abandoned_at, subject_kind, subject_id, kind)
    WHERE abandoned_at IS NOT NULL;
  `,

  `
  -- Item state, so purge takes it: a routing record says where *this item* went.
  CREATE TABLE routing_records (
    id          TEXT    NOT NULL PRIMARY KEY,
    item_id     TEXT    NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    target_kind TEXT    NOT NULL CHECK (target_kind IN ('destination', 'user')),
    -- A destination target names both; a user target names neither.
    destination TEXT    CHECK ((target_kind = 'destination') = (destination IS NOT NULL)),
    capability  TEXT    CHECK ((target_kind = 'destination') = (capability IS NOT NULL)),
    note        TEXT    CHECK (note IS NULL OR target_kind = 'user'),
    -- \`pending\` is unreachable until delivery ships, and is admitted here so
    -- that arrival costs no migration over a table holding real records.
    state       TEXT    NOT NULL CHECK (state IN ('pending', 'delivered')),
    at          INTEGER NOT NULL,
    pointer     TEXT
  ) STRICT;

  -- The queue's routing anti-join. SQLite cannot index a NOT EXISTS, so it rides
  -- on this rather than on the queue's own index.
  CREATE INDEX routing_records_item ON routing_records (item_id, at, id);

  -- The queue and the archive both order on content time, which is a revision or
  -- amendment where there is one and the capture time otherwise. One partial
  -- index each: the two halves cover the table once between them, and the
  -- archive is the half that accumulates.
  CREATE INDEX items_queue
    ON items (COALESCE(content_updated_at, created_at), id)
    WHERE archived_at IS NULL;

  CREATE INDEX items_archived
    ON items (COALESCE(content_updated_at, created_at), id)
    WHERE archived_at IS NOT NULL;
  `,

  `
  -- A delivery is work about a routing record, so a subject is no longer always
  -- an item — and neither CHECK can be widened in place.
  --
  -- \`subject_item\` is resolved when the job is enqueued because it outlives the
  -- subject: an abandoned delivery's reservation is removed, and the surface
  -- reporting the abandonment still has to name the capture that is stuck.
  CREATE TABLE jobs_next (
    id                  TEXT    NOT NULL PRIMARY KEY,
    kind                TEXT    NOT NULL
                        CHECK (kind IN ('enrichment', 'mirror', 'mirror-remove',
                                        'delivery')),
    subject_kind        TEXT    NOT NULL
                        CHECK (subject_kind IN ('item', 'routing-record')),
    subject_id          TEXT    NOT NULL,
    subject_item        TEXT    NOT NULL,
    enrichment          TEXT    CHECK ((kind = 'enrichment') = (enrichment IS NOT NULL)),
    attempt             INTEGER NOT NULL,
    enqueued_at         INTEGER NOT NULL,
    next_attempt_at     INTEGER NOT NULL,
    lease_id            TEXT,
    lease_expires_at    INTEGER CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
    abandoned_at        INTEGER,
    last_failure_code   TEXT,
    last_failure_detail TEXT
                        CHECK ((last_failure_code IS NULL) = (last_failure_detail IS NULL))
  ) STRICT;

  INSERT INTO jobs_next
    (id, kind, subject_kind, subject_id, subject_item, enrichment, attempt,
     enqueued_at, next_attempt_at, lease_id, lease_expires_at, abandoned_at,
     last_failure_code, last_failure_detail)
    SELECT id, kind, subject_kind, subject_id, subject_id, enrichment, attempt,
           enqueued_at, next_attempt_at, lease_id, lease_expires_at, abandoned_at,
           last_failure_code, last_failure_detail FROM jobs;

  DROP TABLE jobs;
  ALTER TABLE jobs_next RENAME TO jobs;

  -- Still about mirror kinds alone. Two pending deliveries of one item are two
  -- legitimate jobs, and they name two records rather than colliding on one.
  CREATE UNIQUE INDEX jobs_one_pending_mirror
    ON jobs (subject_kind, subject_id, kind)
    WHERE kind IN ('mirror', 'mirror-remove')
      AND lease_id IS NULL
      AND abandoned_at IS NULL;

  CREATE UNIQUE INDEX jobs_lease ON jobs (lease_id) WHERE lease_id IS NOT NULL;

  CREATE INDEX jobs_claimable ON jobs (kind, next_attempt_at, enqueued_at, id);
  CREATE INDEX jobs_subject   ON jobs (subject_kind, subject_id, kind);

  CREATE INDEX jobs_abandoned
    ON jobs (abandoned_at, subject_kind, subject_id, kind)
    WHERE abandoned_at IS NOT NULL;
  `,

  `
  -- What the capability was pointed at. A reservation is attempted again from
  -- the record alone, so the target is remembered rather than consumed by the
  -- one attempt \`route\` makes. Only a destination has one.
  ALTER TABLE routing_records ADD COLUMN target TEXT;

  -- SQLite cannot add a CHECK in place, and one that admitted a delivered
  -- record with no target would admit a reservation nothing could carry out.
  CREATE TRIGGER routing_records_target_insert
    BEFORE INSERT ON routing_records
    WHEN (NEW.target_kind = 'destination') <> (NEW.target IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'a destination target names what it targeted'); END;

  CREATE TRIGGER routing_records_target_update
    BEFORE UPDATE ON routing_records
    WHEN (NEW.target_kind = 'destination') <> (NEW.target IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'a destination target names what it targeted'); END;
  `,

  `
  -- The feed's sort key. A revision carries its original's capture time, so the
  -- two tie on \`created_at\` and only the revision link may break that tie.
  --
  -- Derived, and stored anyway: it is written once with the row, from a link that
  -- is never rewritten — purge takes a whole chain — so no later state can
  -- disagree with it. Per read it would be a recursive walk of the whole table.
  ALTER TABLE items ADD COLUMN root_id        TEXT    NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN revision_depth INTEGER NOT NULL DEFAULT 0;

  -- Nothing could write a revision before this migration, so every existing row
  -- is the root of its own chain.
  UPDATE items SET root_id = id;

  DROP INDEX items_feed;
  CREATE INDEX items_feed ON items (created_at, root_id, revision_depth);
  `,

  `
  -- Destinations become pool state: a routing record's \`destination\` refers to
  -- a row rather than into a text file a person can delete a paragraph from.
  -- \`settings\` is the kind's own JSON, opaque here and to core alike.
  CREATE TABLE destinations (
    id          TEXT    NOT NULL PRIMARY KEY,
    name        TEXT    NOT NULL,
    kind        TEXT    NOT NULL,
    settings    TEXT    NOT NULL,
    retired_at  INTEGER,
    created_at  INTEGER NOT NULL,
    modified_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX destinations_created_at ON destinations (created_at, id);

  -- Every destination a record already names, minted so the reference below has
  -- something to point at. The id becomes the name, and the kind is one nothing
  -- registers an adapter for: it reports unusable, and the history stays
  -- readable rather than being dropped for having come from a config file.
  INSERT INTO destinations
    (id, name, kind, settings, retired_at, created_at, modified_at)
    SELECT destination, destination, 'unconfigured', '{}', NULL, MIN(at), MIN(at)
    FROM routing_records
    WHERE destination IS NOT NULL
    GROUP BY destination;

  -- SQLite can add neither a foreign key nor a CHECK in place, so the table is
  -- rebuilt for the key — and the trigger pair that stood in for the CHECK on
  -- \`target\` becomes the CHECK it was always meant to be. A destination row
  -- written before that column existed carried no target, and read as \`{}\`
  -- everywhere; it is written as \`{}\` here so the constraint can stand.
  CREATE TABLE routing_records_next (
    id          TEXT    NOT NULL PRIMARY KEY,
    item_id     TEXT    NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    target_kind TEXT    NOT NULL CHECK (target_kind IN ('destination', 'user')),
    -- RESTRICT rather than CASCADE: a destination a record has ever named can
    -- never stop resolving, so the in-use refusal is the schema's rather than a
    -- check the code has to remember.
    destination TEXT    REFERENCES destinations (id) ON DELETE RESTRICT
                CHECK ((target_kind = 'destination') = (destination IS NOT NULL)),
    capability  TEXT    CHECK ((target_kind = 'destination') = (capability IS NOT NULL)),
    note        TEXT    CHECK (note IS NULL OR target_kind = 'user'),
    target      TEXT    CHECK ((target_kind = 'destination') = (target IS NOT NULL)),
    state       TEXT    NOT NULL CHECK (state IN ('pending', 'delivered')),
    at          INTEGER NOT NULL,
    pointer     TEXT
  ) STRICT;

  INSERT INTO routing_records_next
    (id, item_id, target_kind, destination, capability, note, target, state, at,
     pointer)
    SELECT id, item_id, target_kind, destination, capability, note,
           CASE WHEN target_kind = 'destination' THEN COALESCE(target, '{}') END,
           state, at, pointer
    FROM routing_records;

  DROP TABLE routing_records;
  ALTER TABLE routing_records_next RENAME TO routing_records;

  CREATE INDEX routing_records_item ON routing_records (item_id, at, id);

  -- What "has any routing record ever named this" seeks on, which is both the
  -- deletion refusal's read and the foreign key's own.
  CREATE INDEX routing_records_destination
    ON routing_records (destination)
    WHERE destination IS NOT NULL;
  `,

  `
  -- The mirror carries destinations, so a job's subject is no longer always an
  -- item or a record about one — and neither the CHECK nor \`subject_item\`'s
  -- NOT NULL can be relaxed in place. A destination's mirror write is about no
  -- capture at all, which is what makes the column nullable.
  --
  -- No foreign key to \`destinations\`: a \`mirror-remove\` outlives the row it
  -- names, exactly as one for a purged item outlives the item.
  CREATE TABLE jobs_next (
    id                  TEXT    NOT NULL PRIMARY KEY,
    kind                TEXT    NOT NULL
                        CHECK (kind IN ('enrichment', 'mirror', 'mirror-remove',
                                        'delivery')),
    subject_kind        TEXT    NOT NULL
                        CHECK (subject_kind IN ('item', 'routing-record',
                                                'destination')),
    subject_id          TEXT    NOT NULL,
    subject_item        TEXT    CHECK ((subject_kind = 'destination') = (subject_item IS NULL)),
    enrichment          TEXT    CHECK ((kind = 'enrichment') = (enrichment IS NOT NULL)),
    attempt             INTEGER NOT NULL,
    enqueued_at         INTEGER NOT NULL,
    next_attempt_at     INTEGER NOT NULL,
    lease_id            TEXT,
    lease_expires_at    INTEGER CHECK ((lease_id IS NULL) = (lease_expires_at IS NULL)),
    abandoned_at        INTEGER,
    last_failure_code   TEXT,
    last_failure_detail TEXT
                        CHECK ((last_failure_code IS NULL) = (last_failure_detail IS NULL))
  ) STRICT;

  INSERT INTO jobs_next
    (id, kind, subject_kind, subject_id, subject_item, enrichment, attempt,
     enqueued_at, next_attempt_at, lease_id, lease_expires_at, abandoned_at,
     last_failure_code, last_failure_detail)
    SELECT id, kind, subject_kind, subject_id, subject_item, enrichment, attempt,
           enqueued_at, next_attempt_at, lease_id, lease_expires_at, abandoned_at,
           last_failure_code, last_failure_detail FROM jobs;

  DROP TABLE jobs;
  ALTER TABLE jobs_next RENAME TO jobs;

  -- Still at most one *pending* mirror job per subject, which now reaches a
  -- destination as well as an item.
  CREATE UNIQUE INDEX jobs_one_pending_mirror
    ON jobs (subject_kind, subject_id, kind)
    WHERE kind IN ('mirror', 'mirror-remove')
      AND lease_id IS NULL
      AND abandoned_at IS NULL;

  CREATE UNIQUE INDEX jobs_lease ON jobs (lease_id) WHERE lease_id IS NOT NULL;

  CREATE INDEX jobs_claimable ON jobs (kind, next_attempt_at, enqueued_at, id);
  CREATE INDEX jobs_subject   ON jobs (subject_kind, subject_id, kind);

  CREATE INDEX jobs_abandoned
    ON jobs (abandoned_at, subject_kind, subject_id, kind)
    WHERE abandoned_at IS NOT NULL;
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
