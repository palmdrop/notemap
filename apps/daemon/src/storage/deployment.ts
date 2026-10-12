import { existsSync } from "node:fs";

export const DEPLOYMENT_VARIABLE = "NOTEMAP_DEPLOYMENT";

/** What a container somebody else built leaves behind. */
export const CONTAINER_MARKER = "/.dockerenv";

/** All a daemon can say about one it did not build itself. */
const CONTAINER = "container";

/**
 * What this daemon is deployed as, declared rather than inferred. The image
 * sets the variable; the marker is the fallback for a container built by
 * somebody else. Where neither says so this answers nothing, because absence
 * proves nothing — and nothing here ever guesses at a path: what a volume is
 * mounted from is not discoverable from inside the container that holds it.
 */
export function deploymentOf(
  env: NodeJS.ProcessEnv = process.env,
  contained: boolean = existsSync(CONTAINER_MARKER),
): string | undefined {
  const declared = env[DEPLOYMENT_VARIABLE]?.trim();
  if (declared !== undefined && declared !== "") return declared;

  return contained ? CONTAINER : undefined;
}
