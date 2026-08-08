import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * One static file, served as it is on disk: no framework, no build step, and
 * nothing bundled into the daemon. It is deliberately throwaway — it retires
 * when the real frontend is designed — so it is read from beside the daemon
 * rather than compiled into it.
 */
const FILE = fileURLToPath(new URL("../public/index.html", import.meta.url));

let cached: string | undefined;

export function capturePage(): string {
  cached ??= readFileSync(FILE, "utf8");
  return cached;
}
