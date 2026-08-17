import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BUILD = fileURLToPath(new URL("../../ui/build", import.meta.url));
const TARGET = fileURLToPath(new URL("../public/ui", import.meta.url));

/**
 * The app is built by its own package and copied in whole, so what the daemon
 * serves is the artefact that was tested rather than a second build of it.
 * A daemon built without one still runs: `/v1` is the product, the app is a
 * client of it, and refusing to start over a missing client helps nobody.
 */
export function bundleUi(): void {
  rmSync(TARGET, { recursive: true, force: true });

  if (!existsSync(BUILD)) {
    console.warn(
      `notemap: no app build at ${BUILD} — the daemon will serve /v1 only. Run \`pnpm --filter @notemap/ui build\` first.`,
    );
    return;
  }

  cpSync(BUILD, TARGET, { recursive: true });
}
