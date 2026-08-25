import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS } from "./migrations";
import { createSqlitePoolStore, type SqlitePoolStore } from "./pool-store";
import { store } from "./testing/fixture";

/**
 * The schema version a pool sat at before it carried an identity, pinned rather
 * than counted back from the end: a migration added later moves the end.
 */
const BEFORE_POOL_IDENTITY = 14;

const directories: string[] = [];
const opened: SqlitePoolStore[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((pool) => pool.close()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function reopened(file: string): SqlitePoolStore {
  const pool = createSqlitePoolStore({ file });
  opened.push(pool);
  return pool;
}

describe("the pool says which pool it is", () => {
  it("answers the same identity for the life of one pool", async () => {
    const pooled = store();
    try {
      const first = await pooled.pool.identity();

      expect(await pooled.pool.identity()).toBe(first);
      expect(first).not.toBe("");
    } finally {
      await pooled.cleanup();
    }
  });

  it("keeps that identity across a reopen", async () => {
    const pooled = store();
    const minted = await pooled.pool.identity();
    await pooled.pool.close();

    try {
      expect(await reopened(pooled.file).identity()).toBe(minted);
    } finally {
      await pooled.cleanup();
    }
  });

  it("gives two pools two identities", async () => {
    const one = store();
    const other = store();
    try {
      expect(await one.pool.identity()).not.toBe(await other.pool.identity());
    } finally {
      await one.cleanup();
      await other.cleanup();
    }
  });

  it("mints one for a pool that predates the table, and keeps it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notemap-identity-"));
    directories.push(directory);
    const file = join(directory, "pool.db");

    const raw = new DatabaseSync(file);
    for (const migration of MIGRATIONS.slice(0, BEFORE_POOL_IDENTITY)) {
      raw.exec(migration);
    }
    raw.exec(`PRAGMA user_version = ${BEFORE_POOL_IDENTITY}`);
    raw.close();

    const migrated = reopened(file);
    const minted = await migrated.identity();
    await migrated.close();

    expect(minted).not.toBe("");
    expect(await reopened(file).identity()).toBe(minted);
  });
});
