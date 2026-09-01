import type { DatabaseSync } from "node:sqlite";

/**
 * Applied in order, tracked by `PRAGMA user_version`. A migration is never
 * edited once it has run anywhere real — a new statement goes in a new one.
 */
export function migrate(
  connection: DatabaseSync,
  migrations: readonly string[],
  /** Names the database in the error a newer schema raises. */
  label: string,
): void {
  const applied = (
    connection.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  if (applied > migrations.length) {
    throw new Error(
      `${label} was written by a newer notemap: schema version ${applied}, this build knows ${migrations.length}`,
    );
  }

  for (let version = applied; version < migrations.length; version += 1) {
    try {
      // `user_version` takes no parameter binding, and the value is a loop
      // counter rather than anything a caller supplies.
      connection.exec(
        `BEGIN IMMEDIATE; ${migrations[version]} PRAGMA user_version = ${version + 1}; COMMIT;`,
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
