import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The blobs a client store is holding that no operation in its outbox names.
 * For a store that is a directory — the Raycast extension's — since a browser's
 * IndexedDB is reachable only from the browser.
 *
 * The outbox files are parsed here rather than through `createFilesystemStore`,
 * which would make this script the only thing in the repo root that depends on
 * the client.
 */

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const deleting = args.includes("--delete");
const [directory] = args.filter((arg) => !arg.startsWith("--"));

if (directory === undefined) {
  console.error(
    "notemap: sweep-held-blobs <client-store-directory> [--delete]",
  );
  process.exit(1);
}

type Named = { readonly asset?: unknown };

function namedBy(operation: unknown): readonly string[] {
  if (typeof operation !== "object" || operation === null) return [];
  const held: unknown = (operation as Record<string, unknown>)["operation"];
  if (typeof held !== "object" || held === null) return [];
  const envelope: unknown = (held as Record<string, unknown>)["envelope"];
  if (typeof envelope !== "object" || envelope === null) return [];
  const payload: unknown = (envelope as Record<string, unknown>)["payload"];
  if (typeof payload !== "object" || payload === null) return [];
  const assets: unknown = (payload as Record<string, unknown>)["assets"];
  if (!Array.isArray(assets)) return [];

  return (assets as readonly Named[])
    .map((reference) => reference.asset)
    .filter((asset): asset is string => typeof asset === "string");
}

async function names(outbox: string): Promise<ReadonlySet<string>> {
  let files: string[];
  try {
    files = await readdir(outbox);
  } catch {
    return new Set();
  }

  const named = new Set<string>();
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const read: unknown = JSON.parse(
      await readFile(join(outbox, file), "utf8"),
    );
    for (const asset of namedBy(read)) named.add(asset);
  }
  return named;
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(join(path, "bytes"))).size;
  } catch {
    return 0;
  }
}

const named = await names(join(directory, "outbox"));

let assets: string[];
try {
  assets = await readdir(join(directory, "blobs"));
} catch {
  console.error(`notemap: ${directory} holds no blobs directory`);
  process.exit(1);
}

const unnamed = assets.filter((asset) => !named.has(asset));
let bytes = 0;

for (const asset of unnamed) {
  const path = join(directory, "blobs", asset);
  const size = await sizeOf(path);
  bytes += size;
  console.log(`${deleting ? "deleted" : "unnamed"}  ${asset}  ${size} bytes`);
  if (deleting) await rm(path, { recursive: true, force: true });
}

console.log(
  `notemap: ${String(unnamed.length)} of ${String(assets.length)} blobs named by nothing, ${String(bytes)} bytes` +
    (deleting || unnamed.length === 0 ? "" : " — run again with --delete"),
);
