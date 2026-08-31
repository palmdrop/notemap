import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";

import type {
  CandidateEntry,
  CandidatesAnswer,
  CandidatesRequest,
  Destination,
} from "@notemap/core";

import { APPEND_TO_FILE, CREATE_FILE } from "./capabilities";
import { contain, overlapsAny, realRootOf } from "./paths";
import { asFilesystemSettings } from "./settings";

/** However large a vault gets, past this many entries browsing is a search problem, not a paging one. */
const LIMIT = 500;

export type CandidatesConfig = {
  readonly reserved?: readonly string[];
};

type Offered = "directory" | "file";

/** What `create-file`'s `directory` and `append-to-file`'s `path` each offer. Nothing else does. */
function offered(request: CandidatesRequest): Offered | undefined {
  if (request.capability === CREATE_FILE && request.field === "directory") {
    return "directory";
  }
  if (request.capability === APPEND_TO_FILE && request.field === "path") {
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
    throw new Error(
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
    throw new Error(`${realRoot} overlaps notemap's own ${overlap}`);
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

async function list(directory: string): Promise<readonly Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`${directory}: ${why(cause)}`, { cause });
  }
}

/**
 * Dotfiles cover both the ordinary hidden ones and the `.notemap-*` temporaries
 * a crashed delivery leaves — one rule for both, since the second is a case of
 * the first. A symlinked child is neither a directory nor a file to `readdir`,
 * which does not follow it, so it is silently never offered.
 */
function page(
  kind: Offered,
  prefix: string,
  entries: readonly Dirent[],
): CandidatesAnswer {
  const names = entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) =>
      kind === "directory" ? entry.isDirectory() : entry.isFile(),
    )
    .map((entry) => entry.name)
    .sort();

  const truncated = names.length > LIMIT;

  return {
    truncated,
    entries: names.slice(0, LIMIT).map((name): CandidateEntry => {
      const value = prefix === "" ? name : `${prefix}/${name}`;
      return kind === "directory"
        ? { label: name, value, scope: value }
        : { label: name, value };
    }),
  };
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
