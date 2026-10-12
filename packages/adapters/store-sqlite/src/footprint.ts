import { stat } from "node:fs/promises";

import type { StoreFootprint } from "@notemap/core";
import { statements, type Query } from "@notemap/sqlite";
import type { DatabaseSync } from "node:sqlite";

/**
 * What the database keeps beside its own file. The store opens in WAL mode, so
 * a `-wal` of tens of megabytes is real disk use `page_count` cannot see.
 */
const BESIDE = ["-wal", "-shm"];

const MEMORY = ":memory:";

type Pages = { readonly pages: number };

/**
 * `page_count * page_size` is the database, and the free pages among them are
 * what explains a pool that lost items and did not shrink. A `:memory:` store
 * has no file, and no `-wal` or `-shm` either, so it answers the pages alone.
 */
export function storeFootprint(
  connection: DatabaseSync,
  file: string,
): () => Promise<StoreFootprint> {
  const { query } = statements(connection);
  const pages = query<Pages, []>("PRAGMA page_count");
  const size = query<Pages, []>("PRAGMA page_size");
  const free = query<Pages, []>("PRAGMA freelist_count");

  return async () => {
    const bytes = count(size) * count(pages);
    const unused = count(size) * count(free);

    return {
      bytes: file === MEMORY ? bytes : bytes + (await beside(file)),
      unused,
    };
  };
}

/**
 * Each pragma answers one row of one column, and which column that is, is the
 * pragma's own name — so the value is read positionally rather than by a key
 * this would otherwise have to repeat three times.
 */
function count(query: Query<Pages, []>): number {
  const row = query.get();
  const value = Object.values(row ?? {})[0];
  return typeof value === "number" ? value : 0;
}

/** Neither file exists until the first write, and `-shm` only in WAL mode. */
async function beside(file: string): Promise<number> {
  let bytes = 0;
  for (const suffix of BESIDE) {
    try {
      bytes += (await stat(`${file}${suffix}`)).size;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  return bytes;
}
