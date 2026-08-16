import { readFileSync } from "node:fs";

const text = new Map<string, string>();
const bytes = new Map<string, Uint8Array>();

/** Read once and hold it: these files do not change under a running daemon. */
export function readCached(path: string): string | undefined {
  const held = text.get(path);
  if (held !== undefined) return held;

  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }

  text.set(path, source);
  return source;
}

/**
 * Copied out of the `Buffer` the read returns: that one is a view into a
 * pooled allocation, and this is held for the life of the process.
 */
export function readCachedBytes(path: string): Uint8Array | undefined {
  const held = bytes.get(path);
  if (held !== undefined) return held;

  let source: Uint8Array;
  try {
    source = new Uint8Array(readFileSync(path));
  } catch {
    return undefined;
  }

  bytes.set(path, source);
  return source;
}
