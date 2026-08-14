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

  const version = MIGRATIONS.length - 1;
  const raw = new DatabaseSync(file);
  for (const migration of MIGRATIONS.slice(0, version)) raw.exec(migration);
  raw.exec(`PRAGMA user_version = ${version}`);

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
           (id, kind, subject_kind, subject_id, attempt, enqueued_at, next_attempt_at)
         VALUES (?, 'mirror', 'item', ?, 0, ?, ?)`,
      );

      expect(() => insert.run("rival", "item-1", ENQUEUED, ENQUEUED)).toThrow(
        /UNIQUE|constraint/i,
      );
      // The rule is per item, not per kind of subject.
      expect(() =>
        insert.run("elsewhere", "item-2", ENQUEUED, ENQUEUED),
      ).not.toThrow();
    } finally {
      raw.close();
    }
  });
});
