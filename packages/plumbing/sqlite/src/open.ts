import { DatabaseSync } from "node:sqlite";

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

/**
 * How hard a commit is written down. `full` fsyncs each one, so a committed
 * transaction survives a power cut; `normal` leaves the last commits to the
 * operating system, which a power cut may lose without corrupting anything;
 * `off` fsyncs nothing and a power cut may corrupt the database.
 *
 * The words are the pragma's own, which takes them in any case.
 */
export const SYNCHRONOUS = ["full", "normal", "off"] as const;

export type Synchronous = (typeof SYNCHRONOUS)[number];

export type OpenOptions = {
  readonly file: string;
  readonly busyTimeoutMs?: number;
  readonly foreignKeys?: boolean;
  /** Defaults to `full`: nothing a pool was told it holds is lost to a power cut. */
  readonly synchronous?: Synchronous;
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
  const synchronous = options.synchronous ?? "full";
  const shared = options.file === ":memory:";

  const writer = new DatabaseSync(options.file);
  let reader = writer;

  try {
    if (options.foreignKeys) writer.exec("PRAGMA foreign_keys = ON");
    writer.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    writer.exec(`PRAGMA synchronous = ${synchronous}`);
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
