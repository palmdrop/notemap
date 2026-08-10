import { readFileSync } from "node:fs";

const cache = new Map<string, string>();

/** Read once and hold it: these files do not change under a running daemon. */
export function readCached(path: string): string | undefined {
  const held = cache.get(path);
  if (held !== undefined) return held;

  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }

  cache.set(path, source);
  return source;
}
