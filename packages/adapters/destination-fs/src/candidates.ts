import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  NotOffered,
  Unusable,
  type CandidateEntry,
  type CandidatesAnswer,
  type CandidatesRequest,
  type Destination,
} from "@notemap/core";

import { APPEND, CREATE, CREATE_OR_APPEND } from "@notemap/output-markdown";

import { contain, overlapsAny, realRootOf } from "./paths";
import { asFilesystemSettings } from "./settings";

/** However large a vault gets, past this many entries browsing is a search problem, not a paging one. */
const LIMIT = 500;

export type CandidatesConfig = {
  readonly reserved?: readonly string[];
};

/** What the field may hold. A folder is walked through either way. */
type Offered = "directory" | "file";

/** Which fields offer anything, and which of the two things they offer. Nothing else does. */
function offered(request: CandidatesRequest): Offered | undefined {
  if (request.capability === CREATE && request.field === "directory") {
    return "directory";
  }
  if (request.capability === APPEND && request.field === "path") {
    return "file";
  }
  // The typed line reads folders and files together: one call per level draws
  // the tree and says whether the leaf is there.
  if (request.capability === CREATE_OR_APPEND && request.field === "path") {
    return "file";
  }
  return undefined;
}

export async function filesystemCandidates(
  config: CandidatesConfig,
  destination: Destination,
  request: CandidatesRequest,
): Promise<CandidatesAnswer> {
  const kind = offered(request);
  if (kind === undefined) {
    throw new NotOffered(
      `${request.capability} has no candidates for its ${request.field} field`,
    );
  }

  const settings = asFilesystemSettings(destination.settings);
  if (settings === undefined) {
    throw new Error(`${destination.name} has no readable filesystem settings`);
  }

  const realRoot = await resolveRoot(settings.root);

  const overlap = overlapsAny(realRoot, config.reserved ?? []);
  if (overlap !== undefined) {
    throw new Unusable(`${realRoot} overlaps notemap's own ${overlap}`);
  }

  const located = await contain(realRoot, request.scope ?? "");
  if (located.kind === "refused") throw new Error(located.detail);

  const entries = await list(located.path.absolute);
  return page(kind, located.path.relative, entries);
}

async function resolveRoot(root: string): Promise<string> {
  try {
    return await realRootOf(root);
  } catch (cause) {
    throw new Error(`${root}: ${why(cause)}`, { cause });
  }
}

/** One entry, with the question `readdir` sometimes cannot answer already settled. */
export type Listed = {
  readonly name: string;
  readonly kind: Offered | undefined;
};

async function list(directory: string): Promise<readonly Listed[]> {
  let entries: readonly Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`${directory}: ${why(cause)}`, { cause });
  }

  return Promise.all(entries.map((entry) => settle(directory, entry)));
}

/**
 * A `readdir` that cannot say what an entry is answers `DT_UNKNOWN`, and every
 * predicate on the `Dirent` is then false — which is indistinguishable from a
 * socket unless the entry is asked about directly. FUSE and overlay mounts do
 * this routinely, and a vault on one would otherwise list as empty.
 *
 * `lstat` rather than `stat`, so a symlink stays the thing that is never
 * offered rather than becoming whatever it points at.
 */
export async function settle(
  directory: string,
  entry: Dirent,
): Promise<Listed> {
  if (entry.isDirectory()) return { name: entry.name, kind: "directory" };
  if (entry.isFile()) return { name: entry.name, kind: "file" };
  if (entry.isSymbolicLink()) return { name: entry.name, kind: undefined };

  try {
    const found = await lstat(join(directory, entry.name));
    if (found.isDirectory()) return { name: entry.name, kind: "directory" };
    if (found.isFile()) return { name: entry.name, kind: "file" };
  } catch {
    // Gone between the listing and the question, which is not this read's problem.
  }
  return { name: entry.name, kind: undefined };
}

/**
 * Dotfiles cover both the ordinary hidden ones and the `.notemap-*` temporaries
 * a crashed delivery leaves — one rule for both, since the second is a case of
 * the first. A symlinked child is silently never offered: `readdir` does not
 * follow it and neither does the `lstat` behind it.
 *
 * A folder is always somewhere to look further, and is something the field may
 * hold only where the field holds folders: browsing for a note to append to
 * descends through `projects/` without ever offering it as a note. Folders
 * come first because a flat vault of a few hundred notes would otherwise bury
 * the handful of ways down through it.
 */
function page(
  kind: Offered,
  prefix: string,
  entries: readonly Listed[],
): CandidatesAnswer {
  const named = (entry: Listed): string =>
    prefix === "" ? entry.name : `${prefix}/${entry.name}`;

  const visible = entries.filter((entry) => !entry.name.startsWith("."));
  const byName = (a: Listed, b: Listed): number =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

  const folders = visible
    .filter((entry) => entry.kind === "directory")
    .sort(byName)
    .map((entry): CandidateEntry => {
      const path = named(entry);
      return kind === "directory"
        ? { label: entry.name, value: path, scope: path }
        : { label: entry.name, scope: path };
    });

  const files =
    kind === "directory"
      ? []
      : visible
          .filter((entry) => entry.kind === "file")
          .sort(byName)
          .map((entry): CandidateEntry => ({
            label: entry.name,
            value: named(entry),
          }));

  const all = [...folders, ...files];

  return { truncated: all.length > LIMIT, entries: all.slice(0, LIMIT) };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
