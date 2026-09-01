import { DatabaseSync } from "node:sqlite";

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export type OpenOptions = {
  readonly file: string;
  readonly busyTimeoutMs?: number;
  readonly foreignKeys?: boolean;
  /**
   * A second, read-only connection, so a read outside a transaction cannot see
   * what that transaction may still roll back. A `:memory:` database has none
   * to give — each connection would be a separate database — so it shares the
   * writer and forfeits that isolation.
   */
  readonly reader?: boolean;
};

export type OpenDatabase = {
  readonly writer: DatabaseSync;
  /** The writer itself where no second connection was opened. */
  readonly reader: DatabaseSync;
  readonly close: () => void;
};

export function openDatabase(options: OpenOptions): OpenDatabase {
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const shared = options.file === ":memory:";

  const writer = new DatabaseSync(options.file);
  let reader = writer;

  try {
    if (options.foreignKeys) writer.exec("PRAGMA foreign_keys = ON");
    writer.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    if (!shared) writer.exec("PRAGMA journal_mode = WAL");

    if (options.reader && !shared) {
      reader = new DatabaseSync(options.file);
      reader.exec("PRAGMA query_only = ON");
      reader.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    }
  } catch (cause) {
    // A database that failed to open leaves the caller no connection to close.
    if (reader !== writer) reader.close();
    writer.close();
    throw cause;
  }

  return {
    writer,
    reader,
    close: () => {
      if (reader !== writer) reader.close();
      writer.close();
    },
  };
}
