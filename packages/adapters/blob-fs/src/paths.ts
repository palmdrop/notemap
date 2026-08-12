import { join } from "node:path";

import type { BlobHash } from "@notemap/core";

/** What a crashed write leaves behind, and what a sweep of the directory may remove. */
export const TEMPORARY_PREFIX = ".notemap-";

/** SHA-256, lowercase hex. Anything else never named a blob this driver wrote. */
const HASH = /^[0-9a-f]{64}$/;

const SHARD = 2;

/**
 * `<root>/<first two characters>/<the whole hash>`, following git's object
 * layout: a flat directory of a hundred thousand files is slow to list on every
 * filesystem that has ever mattered.
 *
 * Every component comes from the content, so the path is the same on every
 * machine, forever — which is what lets a mirror rendering point at one.
 */
export function pathFor(root: string, blob: BlobHash): string {
  if (!HASH.test(blob)) {
    throw new TypeError(`not a blob hash: ${blob}`);
  }
  return join(root, blob.slice(0, SHARD), blob);
}
