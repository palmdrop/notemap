import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { AssetId, Client, ItemId } from "@notemap/client";

import { remaining } from "./outbox";

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
 * because the form's picker offers one.
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

export type Capturing = {
  readonly channel: string;
  readonly text: string;
  readonly files: readonly string[];
  readonly tags: readonly string[];
};

/**
 * What the form has to say afterwards: `captured` is in the outbox and safe,
 * `partly` is captured with a tag left unapplied, and `refused` kept nothing.
 */
export type Captured =
  | { readonly kind: "captured"; readonly item: ItemId }
  | { readonly kind: "partly"; readonly item: ItemId; readonly error: unknown }
  | { readonly kind: "refused"; readonly error: unknown };

/**
 * Attaches, captures, then applies the tags one at a time, a tag that fails
 * leaving the capture itself made.
 *
 * Bytes attached for a capture that never happened are let go of: a refused
 * capture keeps them, its outbox entry being the only copy of what it carried,
 * and `detach` leaves those alone.
 */
export async function capturing(
  client: Client,
  { channel, text, files, tags }: Capturing,
): Promise<Captured> {
  let asset: AssetId | undefined;
  let item: ItemId | undefined;

  try {
    asset = await attaching(client, files);
    const captured = await client.capture({
      channel,
      text,
      ...(asset === undefined ? {} : { assets: [asset] }),
    });
    item = captured.id;

    for (const tag of tags) await client.tag(item, tag);
    return { kind: "captured", item };
  } catch (error) {
    if (item !== undefined) return { kind: "partly", item, error };
    if (asset !== undefined) await client.detach(asset).catch(() => undefined);
    return { kind: "refused", error };
  }
}

/** Whether what was captured reached the pool, rather than only the outbox. */
export async function landing(client: Client): Promise<boolean> {
  return (await remaining(client)) === 0;
}
