import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { PoolIdentity } from "@notemap/core";

import type { PoolIdentityRow } from "./rows";

const SINGLETON = 1;

/**
 * Minted on the first read rather than by the migration that made the table,
 * so a pool that predates it takes one without a data migration. The insert
 * ignores a row already there, which is also what makes two hosts opening one
 * file at the same instant agree on which identity won.
 */
export function poolIdentity(connection: DatabaseSync): PoolIdentity {
  connection
    .prepare(
      `INSERT OR IGNORE INTO pool_identity (singleton, identity) VALUES (?, ?)`,
    )
    .run(SINGLETON, randomUUID());

  const row = connection
    .prepare(
      `SELECT singleton, identity FROM pool_identity WHERE singleton = ?`,
    )
    .get(SINGLETON) as PoolIdentityRow | undefined;

  if (row === undefined) {
    throw new Error(
      "store-sqlite: the pool identity went missing as it was minted",
    );
  }
  return row.identity as PoolIdentity;
}
