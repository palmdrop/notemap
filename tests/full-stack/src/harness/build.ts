import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const BUILD = fileURLToPath(
  new URL("../../../../apps/daemon/scripts/build.ts", import.meta.url),
);

/**
 * The suite runs the daemon rather than importing it, so a stale `dist/` would
 * test the last change instead of this one.
 */
export async function setup(): Promise<void> {
  await promisify(execFile)("node", [BUILD]);
}
