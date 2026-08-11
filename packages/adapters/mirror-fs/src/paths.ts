import { createHash } from "node:crypto";
import { join } from "node:path";

import type { MirrorRecord } from "@notemap/core";

/** Everything a filename may contain, on every filesystem worth supporting. */
const SAFE = /^[A-Za-z0-9._-]+$/;

export type MirrorPaths = {
  readonly directory: string;
  readonly record: string;
  readonly rendering: string;
};

/**
 * Where one item's pair lives, from the item alone.
 *
 * Every component is immutable — the capture time in UTC, the payload type, the
 * id — so the same item resolves to the same path on every machine, forever.
 * That is what lets a rewrite, a removal and a repair address a file directly
 * in a store nothing ever indexes.
 */
export function pathsFor(root: string, record: MirrorRecord): MirrorPaths {
  const captured = new Date(record.item.createdAt);
  const directory = join(
    root,
    String(captured.getUTCFullYear()).padStart(4, "0"),
    twoDigits(captured.getUTCMonth() + 1),
    twoDigits(captured.getUTCDate()),
  );

  const stem = [
    `T${twoDigits(captured.getUTCHours())}${twoDigits(captured.getUTCMinutes())}${twoDigits(captured.getUTCSeconds())}`,
    filenameSafe(record.item.payload.type),
    filenameSafe(record.item.id),
  ].join("-");

  return {
    directory,
    record: join(directory, `${stem}.json`),
    rendering: join(directory, `${stem}.md`),
  };
}

/** What the suffix of an item's pair is, for finding files whose item is gone. */
export function stemSuffixFor(item: string): string {
  return `-${filenameSafe(item)}`;
}

/**
 * A client may mint its own capture id, and nothing stops it containing a
 * separator. Anything unsafe is replaced — and the original is hashed into the
 * name, so two ids that sanitise alike still land in two files. One file per
 * item is the guarantee coalescing is built on.
 */
function filenameSafe(value: string): string {
  if (SAFE.test(value) && value !== "." && value !== "..") return value;

  const replaced = value.replace(/[^A-Za-z0-9._-]/g, "_") || "_";
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `${replaced}-${digest}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
