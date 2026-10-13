import { existsSync } from "node:fs";

export const DEPLOYMENT_VARIABLE = "NOTEMAP_DEPLOYMENT";

/** What a container somebody else built leaves behind. */
export const CONTAINER_MARKER = "/.dockerenv";

/** All a daemon can say about one it did not build itself. */
const CONTAINER = "container";

/**
 * What this daemon is deployed as, and whether the paths it reports are a
 * container's rather than the operator's own. The two are apart because the
 * name is free text an image declares and the containment is the only part of
 * it a daemon can check: a surface may label the deployment whatever it was
 * told, and may say where the paths live only where this says so.
 */
export type Deployment = {
  readonly name: string;
  readonly contained: boolean;
};

/**
 * Declared rather than inferred. The image sets the variable; the marker is the
 * fallback for a container built by somebody else, and is also what `contained`
 * answers — a declared name is not evidence of anything, so an operator
 * labelling a bare-metal daemon is never told its paths are a container's.
 *
 * Where neither says so this answers nothing, because absence proves nothing —
 * and nothing here ever guesses at a path: what a volume is mounted from is not
 * discoverable from inside the container that holds it.
 */
export function deploymentOf(
  env: NodeJS.ProcessEnv = process.env,
  contained: boolean = existsSync(CONTAINER_MARKER),
): Deployment | undefined {
  const declared = env[DEPLOYMENT_VARIABLE]?.trim();
  if (declared !== undefined && declared !== "") {
    return { name: declared, contained };
  }

  return contained ? { name: CONTAINER, contained } : undefined;
}
