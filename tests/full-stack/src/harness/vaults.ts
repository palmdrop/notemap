import type { Client } from "@notemap/client";

import type { Running } from "./daemon.ts";
import { DOWN, UP } from "./world.ts";

export type Vaults = {
  /** The destination whose folder is there. */
  readonly up: string;
  /** The one whose folder is not, which is how a delivery comes to be owed. */
  readonly down: string;
};

/**
 * The two destinations, made the way a person makes one. They are pool state
 * rather than configuration, so a world that already holds them — a restart —
 * is answered with what it has instead of a second pair. Over the daemon's own
 * client, or over one a test signed in for itself.
 */
export async function vaults(
  running: Running,
  over: Client = running.client,
): Promise<Vaults> {
  const held = await over.destinations.load();
  const idFor = async (name: string, root: string): Promise<string> => {
    const already = held.find((each) => each.name === name);
    if (already !== undefined) return already.id;

    const made = await over.destinations.create({
      name,
      kind: "filesystem",
      settings: { root },
    });
    return made.id;
  };

  return {
    up: await idFor(UP, running.world.up),
    down: await idFor(DOWN, running.world.down),
  };
}
