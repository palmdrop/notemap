import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { MirrorFootprint } from "@notemap/core";

import { TEMPORARY_PREFIX } from "./atomic";

/**
 * One walk of the tree: a `.json` is a record, everything the mirror holds is a
 * file, and a temporary left mid-write is neither — it is this driver's own
 * debris rather than something the mirror holds.
 *
 * A root that is not there yet is a mirror nothing has been written to, which
 * is zeroes rather than a failure. Aborted, it throws: half a figure read as a
 * whole one is worse than no figure.
 */
export async function mirrorFootprint(
  root: string,
  signal?: AbortSignal,
): Promise<MirrorFootprint> {
  let records = 0;
  let files = 0;
  let bytes = 0;

  for (const entry of await held(root)) {
    signal?.throwIfAborted();
    if (!entry.isFile() || entry.name.startsWith(TEMPORARY_PREFIX)) continue;

    files += 1;
    if (entry.name.endsWith(".json")) records += 1;
    bytes += await sizeOf(join(entry.parentPath, entry.name));
  }

  return { records, files, bytes };
}

async function held(root: string) {
  try {
    return await readdir(root, { recursive: true, withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
}

/** A file removed between the walk and the `stat` takes nothing. */
async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw cause;
  }
}
