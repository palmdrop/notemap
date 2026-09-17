import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { AssetId, Client } from "@notemap/client";

/**
 * What the pool reads an attachment as, which is what decides whether it comes
 * back as an image. Raycast hands back a path and nothing else, so the
 * extension is the only thing here that could say.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

/** One line, short enough for a toast to say what was captured. */
export function excerpt(text: string, at = 60): string {
  const line = text.trim().replace(/\s+/gu, " ");
  return line.length <= at ? line : `${line.slice(0, at - 1).trimEnd()}…`;
}

/** What the picker offered and what was typed, as one list without repeats. */
export function chosen(
  picked: readonly string[],
  typed: string,
): readonly string[] {
  const written = typed
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

  return [...new Set([...picked, ...written])];
}

/**
 * The bytes are read here and held by the store, so a note made while the pool
 * is unreachable still has its attachment when the drain reaches it. One file,
 * because that is what a capture carries.
 */
export async function attaching(
  client: Client,
  paths: readonly string[],
): Promise<AssetId | undefined> {
  const path = paths[0];
  if (path === undefined) return undefined;

  const bytes = await readFile(path);
  const type = MEDIA_TYPES[extname(path).toLowerCase()];

  return client.attach(
    new File([bytes], basename(path), type === undefined ? {} : { type }),
  );
}

/** Whether what was captured reached the pool, rather than only the outbox. */
export async function landing(client: Client): Promise<boolean> {
  await client.drain();

  const waiting = await new Promise<number>((resolve) => {
    client.waiting.subscribe((count) => resolve(count)).unsubscribe();
  });

  return waiting === 0;
}
