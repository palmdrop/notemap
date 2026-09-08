import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Duration, ItemId, JobId } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS } from "./migrations";
import { createSqlitePoolStore, type SqlitePoolStore } from "./pool-store";
import { at } from "./testing/fixture";

const MINUTE = 60_000 as Duration;
const NOW = at("2026-08-03T10:00:00.000Z");
const ENQUEUED = Date.parse("2026-08-03T09:00:00.000Z");

/** The three columns only an abandoned job fills, in the order they are bound. */
const NEVER = [null, null, null] as const;

/**
 * The schema version this migrates from, pinned rather than counted back from
 * the end: a migration added later moves the end and would silently retarget
 * these at a different starting point.
 */
const BEFORE_SUBJECT_SPLIT = 6;

/** The version a pool was at before destinations became rows of their own. */
const BEFORE_DESTINATIONS_MOVED = 10;

/** Before that, the version at which a destination record remembered no target. */
const BEFORE_TARGET_REMEMBERED = 9;

/** The version at which the feed still sorted on a denormalised revision chain. */
const BEFORE_ONE_KEY = 13;

/** The version at which a capture was still typed `text` or `image`. */
const BEFORE_ONE_PAYLOAD_TYPE = 20;

/** The version at which a capability was still named after a file. */
const BEFORE_GENERIC_CAPABILITIES = 21;

const directories: string[] = [];
const opened: SqlitePoolStore[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((pool) => pool.close()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A pool as it stood before the subject was split, with work already owed. */
function pooledAtPreviousVersion(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-migration-"));
  directories.push(directory);
  const file = join(directory, "pool.db");

  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, BEFORE_SUBJECT_SPLIT)) {
    raw.exec(migration);
  }
  raw.exec(`PRAGMA user_version = ${BEFORE_SUBJECT_SPLIT}`);

  const insert = raw.prepare(
    `INSERT INTO jobs
       (id, kind, subject, enrichment, attempt, enqueued_at, next_attempt_at,
        abandoned_at, last_failure_code, last_failure_detail)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  );

  insert.run("write", "mirror", "item-1", null, ENQUEUED, ENQUEUED, ...NEVER);
  insert.run(
    "remove",
    "mirror-remove",
    "item-1",
    null,
    ENQUEUED,
    ENQUEUED,
    ...NEVER,
  );
  insert.run(
    "transcribe",
    "enrichment",
    "item-2",
    "transcribe",
    ENQUEUED,
    ENQUEUED,
    ...NEVER,
  );
  insert.run(
    "given-up",
    "mirror",
    "item-3",
    null,
    ENQUEUED,
    ENQUEUED,
    Date.parse("2026-08-03T09:30:00.000Z"),
    "renderer-threw",
    "no",
  );

  raw.close();
  return file;
}

function migrated(file: string): SqlitePoolStore {
  const pool = createSqlitePoolStore({ file });
  opened.push(pool);
  return pool;
}

function jobRows(file: string) {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return raw
      .prepare(
        `SELECT id, kind, subject_kind, subject_id, enrichment
         FROM jobs ORDER BY id`,
      )
      .all();
  } finally {
    raw.close();
  }
}

describe("splitting a job's subject into a kind and an id", () => {
  it("carries every job over as work about an item", () => {
    const file = pooledAtPreviousVersion();
    migrated(file);

    expect(jobRows(file)).toEqual([
      {
        id: "given-up",
        kind: "mirror",
        subject_kind: "item",
        subject_id: "item-3",
        enrichment: null,
      },
      {
        id: "remove",
        kind: "mirror-remove",
        subject_kind: "item",
        subject_id: "item-1",
        enrichment: null,
      },
      {
        id: "transcribe",
        kind: "enrichment",
        subject_kind: "item",
        subject_id: "item-2",
        enrichment: "transcribe",
      },
      {
        id: "write",
        kind: "mirror",
        subject_kind: "item",
        subject_id: "item-1",
        enrichment: null,
      },
    ]);
  });

  it("leaves the work it carried over claimable", async () => {
    const pool = migrated(pooledAtPreviousVersion());

    const leases = await pool.claim(
      { kinds: ["mirror", "enrichment"], limit: 10, leaseFor: MINUTE },
      NOW,
    );

    expect(leases.map((lease) => lease.job.id).sort()).toEqual([
      "transcribe",
      "write",
    ]);
    expect(leases.map((lease) => lease.job.subject)).toContainEqual({
      kind: "item",
      item: "item-1",
    });
  });

  it("still coalesces a later job into the one already pending", async () => {
    const file = pooledAtPreviousVersion();
    const pool = migrated(file);

    await pool.transaction((tx) =>
      tx.enqueue([
        {
          id: "second" as JobId,
          kind: "mirror",
          subject: { kind: "item", item: "item-1" as ItemId },
          attempt: 0,
          enqueuedAt: NOW,
        },
      ]),
    );

    expect(jobRows(file).map((row) => (row as { id: string }).id)).toEqual([
      "given-up",
      "remove",
      "transcribe",
      "write",
    ]);
  });

  /**
   * The index is what makes coalescing a constraint rather than a convention,
   * so it is asserted against raw SQL: `enqueue` would absorb the second row
   * itself and prove nothing about the rule underneath.
   */
  it("still permits at most one pending mirror job per item", () => {
    const file = pooledAtPreviousVersion();
    migrated(file);

    const raw = new DatabaseSync(file);
    try {
      const insert = raw.prepare(
        `INSERT INTO jobs
           (id, kind, subject_kind, subject_id, subject_item, attempt,
            enqueued_at, next_attempt_at)
         VALUES (?, 'mirror', 'item', ?, ?, 0, ?, ?)`,
      );

      expect(() =>
        insert.run("rival", "item-1", "item-1", ENQUEUED, ENQUEUED),
      ).toThrow(/UNIQUE|constraint/i);
      // The rule is per item, not per kind of subject.
      expect(() =>
        insert.run("elsewhere", "item-2", "item-2", ENQUEUED, ENQUEUED),
      ).not.toThrow();
    } finally {
      raw.close();
    }
  });
});

/** A pool whose records name destinations that only ever existed in a config file. */
function routedAtPreviousVersion(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-migration-"));
  directories.push(directory);
  const file = join(directory, "pool.db");

  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, BEFORE_TARGET_REMEMBERED)) {
    raw.exec(migration);
  }

  raw
    .prepare(
      `INSERT INTO items (id, source_id, source_item_id, payload_type,
         payload_content, payload_metadata, created_at, modified_at)
       VALUES ('item-1', 'src', 'a', 'text', '{}', '{}', ?, ?)`,
    )
    .run(ENQUEUED, ENQUEUED);

  const untargeted = raw.prepare(
    `INSERT INTO routing_records
       (id, item_id, target_kind, destination, capability, note, state, at)
     VALUES (?, 'item-1', ?, ?, ?, ?, ?, ?)`,
  );

  // Written before the column existed, and read as `{}` ever since.
  untargeted.run(
    "to-vault",
    "destination",
    "vault",
    "create-file",
    null,
    "delivered",
    ENQUEUED,
  );
  untargeted.run(
    "by-hand",
    "user",
    null,
    null,
    "pasted it",
    "delivered",
    ENQUEUED + 2,
  );

  raw.exec(MIGRATIONS[BEFORE_TARGET_REMEMBERED] ?? "");
  raw.exec(`PRAGMA user_version = ${BEFORE_DESTINATIONS_MOVED}`);

  raw
    .prepare(
      `INSERT INTO routing_records
         (id, item_id, target_kind, destination, capability, note, target,
          state, at)
       VALUES ('again', 'item-1', 'destination', 'vault', 'create-file', NULL,
               '{}', 'pending', ?)`,
    )
    .run(ENQUEUED + 1);

  raw.close();
  return file;
}

function destinationRows(file: string) {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return raw
      .prepare(
        `SELECT id, name, kind, settings, retired_at, created_at
                FROM destinations ORDER BY id`,
      )
      .all();
  } finally {
    raw.close();
  }
}

describe("moving destinations into the pool", () => {
  it("mints a row per destination a record already named, so the history stays readable", () => {
    const file = routedAtPreviousVersion();
    migrated(file);

    expect(destinationRows(file)).toEqual([
      {
        id: "vault",
        name: "vault",
        // Nothing registers an adapter for it, so it reports unusable rather
        // than being dropped for having come from a config file.
        kind: "unconfigured",
        settings: "{}",
        retired_at: null,
        created_at: ENQUEUED,
      },
    ]);
  });

  it("leaves every record resolving, target and all", async () => {
    const file = routedAtPreviousVersion();
    const pool = migrated(file);

    const records = await pool.routingRecords("item-1" as ItemId);
    expect(records.map((each) => each.target)).toEqual([
      // The rename left records alone, so one written before it keeps the
      // spelling it was written with.
      {
        kind: "destination",
        destination: "vault",
        capability: "create-file",
        // Written before the column existed, and read as `{}` ever since.
        arguments: {},
      },
      {
        kind: "destination",
        destination: "vault",
        capability: "create-file",
        arguments: {},
      },
      { kind: "user", note: "pasted it" },
    ]);
  });

  it("stands the in-use refusal on the schema", () => {
    const file = routedAtPreviousVersion();
    migrated(file);

    const raw = new DatabaseSync(file);
    try {
      raw.exec("PRAGMA foreign_keys = ON");
      expect(() =>
        raw.prepare("DELETE FROM destinations WHERE id = 'vault'").run(),
      ).toThrow(/FOREIGN KEY/i);
    } finally {
      raw.close();
    }
  });
});

/** A pool as it stood while the feed sorted on `root_id` and `revision_depth`. */
function chainedAtPreviousVersion(
  rows: readonly (readonly [string, string, string | null])[],
): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-migration-"));
  directories.push(directory);
  const file = join(directory, "pool.db");

  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, BEFORE_ONE_KEY)) {
    raw.exec(migration);
  }
  raw.exec(`PRAGMA user_version = ${BEFORE_ONE_KEY}`);

  const insert = raw.prepare(
    `INSERT INTO items (id, source_id, source_item_id, payload_type,
       payload_content, payload_metadata, created_at, modified_at, revision_of,
       root_id, revision_depth)
     VALUES (?, 'src', ?, 'text', '{}', '{}', ?, ?, ?, ?, ?)`,
  );

  rows.forEach(([id, sourceItemId, revisionOf], depth) => {
    insert.run(
      id,
      sourceItemId,
      ENQUEUED + depth,
      ENQUEUED + depth,
      revisionOf,
      revisionOf === null ? id : (rows[0]?.[0] ?? id),
      revisionOf === null ? 0 : depth,
    );
  });

  raw.close();
  return file;
}

describe("collapsing the surfaces onto one key", () => {
  it("keeps the items it had, without the columns that ordered them", async () => {
    const file = chainedAtPreviousVersion([
      ["item-1", "a", null],
      ["item-2", "b", "item-1"],
    ]);

    const pool = migrated(file);

    expect(
      (await pool.feed({ limit: 50, order: "oldest-first" })).values.map(
        (item) => item.id,
      ),
    ).toEqual(["item-1", "item-2"]);
    expect((await pool.item("item-1" as ItemId))?.revisedInto).toEqual([
      "item-2",
    ]);

    const raw = new DatabaseSync(file, { readOnly: true });
    try {
      const columns = raw
        .prepare("SELECT name FROM pragma_table_info('items')")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(columns).not.toContain("root_id");
      expect(columns).not.toContain("revision_depth");
    } finally {
      raw.close();
    }
  });

  it("refuses to migrate a pool whose revisions share an identity", () => {
    const file = chainedAtPreviousVersion([
      ["item-1", "same", null],
      ["item-2", "same", "item-1"],
    ]);

    expect(() => migrated(file)).toThrow(/UNIQUE|constraint/i);
  });
});

/** A pool holding one capture of each of the two types that collapse. */
function typedAtPreviousVersion(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-migration-"));
  directories.push(directory);
  const file = join(directory, "pool.db");

  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, BEFORE_ONE_PAYLOAD_TYPE)) {
    raw.exec(migration);
  }
  raw.exec(`PRAGMA user_version = ${BEFORE_ONE_PAYLOAD_TYPE}`);

  const insert = raw.prepare(
    `INSERT INTO items (id, source_id, source_item_id, payload_type,
       payload_content, payload_metadata, created_at, modified_at)
     VALUES (?, 'web-manual', ?, ?, ?, '{}', ?, ?)`,
  );

  insert.run(
    "item-said",
    "src-said",
    "text",
    JSON.stringify({ text: "a thought" }),
    ENQUEUED,
    ENQUEUED,
  );
  insert.run(
    "item-shot",
    "src-shot",
    "image",
    JSON.stringify({ caption: "mum, 1994" }),
    ENQUEUED,
    ENQUEUED,
  );
  insert.run("item-bare", "src-bare", "image", "{}", ENQUEUED, ENQUEUED);

  raw.close();
  return file;
}

describe("collapsing the payload types into one", () => {
  it("types every capture `note` and moves a caption to where prose lives", async () => {
    const pool = migrated(typedAtPreviousVersion());

    const said = await pool.item("item-said" as ItemId);
    const shot = await pool.item("item-shot" as ItemId);
    const bare = await pool.item("item-bare" as ItemId);

    expect(said?.payload).toMatchObject({
      type: "note",
      content: { text: "a thought" },
    });
    expect(shot?.payload).toMatchObject({
      type: "note",
      content: { text: "mum, 1994" },
    });
    expect(bare?.payload.type).toBe("note");
    // A capture that said nothing keeps no key at all.
    expect(bare?.payload.content).toEqual({});
  });

  it("leaves a mirror write owed for every capture it rewrote", () => {
    const file = typedAtPreviousVersion();
    migrated(file);

    expect(jobRows(file)).toEqual([
      {
        id: "mirror-note-item-bare",
        kind: "mirror",
        subject_kind: "item",
        subject_id: "item-bare",
        enrichment: null,
      },
      {
        id: "mirror-note-item-said",
        kind: "mirror",
        subject_kind: "item",
        subject_id: "item-said",
        enrichment: null,
      },
      {
        id: "mirror-note-item-shot",
        kind: "mirror",
        subject_kind: "item",
        subject_id: "item-shot",
        enrichment: null,
      },
    ]);
  });
});

/** A pool whose templates were saved under the file-shaped capability names. */
function savedAtPreviousVersion(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-migration-"));
  directories.push(directory);
  const file = join(directory, "pool.db");

  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, BEFORE_GENERIC_CAPABILITIES)) {
    raw.exec(migration);
  }
  raw.exec(`PRAGMA user_version = ${BEFORE_GENERIC_CAPABILITIES}`);

  const insert = raw.prepare(
    `INSERT INTO routing_templates
       (id, name, destination_id, capability, arguments, folder, trigger_tag,
        established_at, created_at, modified_at)
     VALUES (?, ?, 'vault', ?, '{}', 'create', NULL, NULL, ?, ?)`,
  );

  insert.run("t-create", "drafts", "create-file", ENQUEUED, ENQUEUED);
  insert.run("t-append", "log", "append-to-file", ENQUEUED, ENQUEUED);
  insert.run("t-either", "inbox", "create-or-append-file", ENQUEUED, ENQUEUED);
  // Saved by a kind that never had the file-shaped names, and left alone.
  insert.run("t-block", "board", "create", ENQUEUED, ENQUEUED);

  raw.close();
  return file;
}

function templateCapabilities(file: string) {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return raw
      .prepare("SELECT id, capability FROM routing_templates ORDER BY id")
      .all();
  } finally {
    raw.close();
  }
}

describe("capability names that stopped being file-shaped", () => {
  it("respells every template, which is live and fires on a tag", () => {
    const file = savedAtPreviousVersion();
    migrated(file);

    expect(templateCapabilities(file)).toEqual([
      { id: "t-append", capability: "append" },
      { id: "t-block", capability: "create" },
      { id: "t-create", capability: "create" },
      { id: "t-either", capability: "create-or-append" },
    ]);
  });
});
