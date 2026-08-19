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
 * is answered with what it has instead of a second pair.
 */
export async function vaults(running: Running): Promise<Vaults> {
  const held = await running.client.destinations.load();
  const idFor = async (name: string, root: string): Promise<string> => {
    const already = held.find((each) => each.name === name);
    if (already !== undefined) return already.id;

    const made = await running.client.destinations.create({
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
