import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const BUILDS = ["apps/daemon", "apps/relay-memos"].map((app) =>
  fileURLToPath(
    new URL(`../../../../${app}/scripts/build.ts`, import.meta.url),
  ),
);

/**
 * The suite runs the daemon and the relay rather than importing them, so a
 * stale `dist/` would test the last change instead of this one.
 */
export async function setup(): Promise<void> {
  for (const build of BUILDS) await promisify(execFile)("node", [build]);
}
