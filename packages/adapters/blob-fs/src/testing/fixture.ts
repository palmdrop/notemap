import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BlobHash } from "@notemap/core";

export function root(): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-blob-"));
  return {
    path: join(directory, "assets"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** What the store must arrive at, computed the other way round. */
export function sha256(value: Uint8Array): BlobHash {
  return createHash("sha256").update(value).digest("hex") as BlobHash;
}

export async function* streamOf(
  ...chunks: readonly Uint8Array[]
): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

export async function collect(
  stream: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/** Every file under the root, path relative to it, so debris is as visible as a blob. */
export async function filesUnder(path: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path, { recursive: true, withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(path.length + 1))
    .sort();
}
