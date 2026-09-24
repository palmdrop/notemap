import { createHash } from "node:crypto";
import { join } from "node:path";

import type {
  DestinationId,
  ItemMirrorRecord,
  PoolSettingName,
  RoutingTemplateId,
} from "@notemap/core";

/** Everything a filename may contain, on every filesystem worth supporting. */
const SAFE = /^[a-z0-9._-]+$/i;

/** Beside the years rather than under one: a destination belongs to no day. */
export const DESTINATIONS = "destinations";

/** Beside the destinations, and on the same reasoning. */
export const TEMPLATES = "templates";

/** Beside the destinations and templates: pool state that belongs to no day. */
export const SETTINGS = "settings";

export type MirrorPaths = {
  readonly directory: string;
  readonly record: string;
  readonly rendering: string;
};

/**
 * Where one item's pair lives, from the item alone:
 * `<root>/2026/08/11/T142305-text-abc123.json` and its `.md` beside it.
 *
 * Every component is immutable, so the same item resolves to the same path on
 * every machine, forever.
 */
export function pathsFor(root: string, record: ItemMirrorRecord): MirrorPaths {
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

export function destinationPathFor(root: string, id: DestinationId): string {
  return join(root, DESTINATIONS, `${filenameSafe(id)}.json`);
}

export function templatePathFor(root: string, id: RoutingTemplateId): string {
  return join(root, TEMPLATES, `${filenameSafe(id)}.json`);
}

export function poolSettingPathFor(
  root: string,
  name: PoolSettingName,
): string {
  return join(root, SETTINGS, `${filenameSafe(name)}.json`);
}

/** The rendering that belongs to a record file, which shares its stem. */
export function renderingBeside(record: string): string {
  return `${record.slice(0, -".json".length)}.md`;
}

/**
 * Anything but a lowercase safe name is replaced *and* given a digest of the
 * original, so two ids landing on one filename is impossible. Case counts:
 * `abc` and `ABC` are two items but one file on macOS and Windows.
 *
 * The encoding is therefore one-way — a name cannot be turned back into an id,
 * and code that needs an item's identity reads it from the record.
 */
function filenameSafe(value: string): string {
  const lowercase = value.toLowerCase();
  if (SAFE.test(value) && value === lowercase && !/^\.\.?$/.test(value)) {
    return value;
  }

  const replaced = lowercase.replace(/[^a-z0-9._-]/g, "_") || "_";
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `${replaced}-${digest}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
