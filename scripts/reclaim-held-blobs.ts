import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Deletes each blob a client store holds that no operation in its outbox names,
 * once it has gone untouched for a grace window: the bytes are written before
 * the operation that names them, so to a walk running at the wrong instant
 * "named" and "about to be named" look alike.
 *
 * For a store that is a directory — the Raycast extension's — since a browser's
 * IndexedDB is reachable only from the browser.
 *
 * The outbox files are parsed here rather than through `createFilesystemStore`,
 * which would make this script the only thing in the repo root that depends on
 * the client.
 */

/** Longer than the gap between an attach and the capture that names it, by any margin. */
const GRACE_MS = 10 * 60 * 1000;

/** Every operation kind the client writes. One not named here may name assets this cannot see. */
const KINDS: ReadonlySet<string> = new Set([
  "capture",
  "edit",
  "archive",
  "unarchive",
  "tag",
  "untag",
  "accept-suggestion",
  "reject-suggestion",
]);

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const deleting = args.includes("--delete");
const [directory] = args.filter((arg) => !arg.startsWith("--"));

if (directory === undefined) {
  console.error(
    "notemap: reclaim-held-blobs <client-store-directory> [--delete]",
  );
  process.exit(1);
}

type Named = { readonly asset?: unknown };

type Read = {
  /** Every asset an operation names, and every kind of operation that was read. */
  readonly named: ReadonlySet<string>;
  readonly kinds: ReadonlySet<string>;
  /** Operation files that could not be read, whose assets cannot be told from an orphan. */
  readonly unread: number;
};

function at(held: unknown, key: string): unknown {
  if (typeof held !== "object" || held === null) return undefined;
  return (held as Record<string, unknown>)[key];
}

function namedBy(operation: unknown): readonly string[] {
  const assets = at(at(at(operation, "envelope"), "payload"), "assets");
  if (!Array.isArray(assets)) return [];

  return (assets as readonly Named[])
    .map((reference) => reference.asset)
    .filter((asset): asset is string => typeof asset === "string");
}

async function read(outbox: string): Promise<Read> {
  let files: string[];
  try {
    files = await readdir(outbox);
  } catch {
    return { named: new Set(), kinds: new Set(), unread: 0 };
  }

  const named = new Set<string>();
  const kinds = new Set<string>();
  let unread = 0;

  // Quarantined operations are read too, where they can be: the client never
  // reads one again, but deleting what one names forecloses recovering it.
  for (const file of files.filter(
    (name) => name.endsWith(".json") || name.endsWith(".unreadable"),
  )) {
    let held: unknown;
    try {
      held = JSON.parse(await readFile(join(outbox, file), "utf8"));
    } catch {
      unread += 1;
      continue;
    }

    const operation = at(held, "operation");
    const kind = at(operation, "kind");
    kinds.add(typeof kind === "string" ? kind : "unnamed");
    for (const asset of namedBy(operation)) named.add(asset);
  }

  return { named, kinds, unread };
}

/** When the blob was last written, its directory included, where a rename may be in flight. */
async function touched(path: string): Promise<number> {
  const times = await Promise.all(
    [path, join(path, "bytes")].map(async (each) => {
      try {
        return (await stat(each)).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  return Math.max(...times);
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(join(path, "bytes"))).size;
  } catch {
    return 0;
  }
}

const outbox = await read(join(directory, "outbox"));

const unknown = [...outbox.kinds].filter((kind) => !KINDS.has(kind));
if (unknown.length > 0) {
  console.error(
    `notemap: this outbox holds operations this script does not know (${unknown.join(", ")}), which may name assets it cannot see`,
  );
  process.exit(1);
}

let assets: string[];
try {
  assets = await readdir(join(directory, "blobs"));
} catch {
  console.error(`notemap: ${directory} holds no blobs directory`);
  process.exit(1);
}

const now = Date.now();
const unnamed = assets.filter((asset) => !outbox.named.has(asset));
let bytes = 0;
let kept = 0;

for (const asset of unnamed) {
  const path = join(directory, "blobs", asset);
  if (now - (await touched(path)) < GRACE_MS) {
    kept += 1;
    console.log(`held back  ${asset}  written just now`);
    continue;
  }

  const size = await sizeOf(path);
  bytes += size;
  console.log(`${deleting ? "deleted" : "unnamed"}  ${asset}  ${size} bytes`);
  if (deleting) await rm(path, { recursive: true, force: true });
}

const taken = unnamed.length - kept;
console.log(
  `notemap: ${String(taken)} of ${String(assets.length)} blobs named by nothing, ${String(bytes)} bytes` +
    (kept === 0 ? "" : `; ${String(kept)} held back inside the grace window`) +
    (outbox.unread === 0
      ? ""
      : `; ${String(outbox.unread)} operation files could not be read, and anything they name is counted as named by nothing`) +
    (deleting || taken === 0 ? "" : " — run again with --delete"),
);
