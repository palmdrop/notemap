import { answered, type Api } from "#api/http";
import type { Counts } from "#api/types";
import { derived, writable } from "../observable/observable";
import type { CountsApi } from "../types";

export type CountsDeps = {
  readonly api: Api;
};

/** The controls the client owns: when to read again is its business, not a shell's. */
export type HeldCounts = CountsApi & {
  /** Reads again, once however often it is asked while a read is out. */
  stale(): void;
};

/**
 * Held in memory and never persisted: a count is about now, and one read back
 * from yesterday's store would say something the pool no longer holds.
 */
export function createCounts(deps: CountsDeps): HeldCounts {
  const held = writable<Counts | undefined>(undefined);
  let reading: Promise<Counts> | undefined;
  let again = false;

  async function read(): Promise<Counts> {
    const answer = await answered(deps.api.GET("/v1/counts"));
    held.set(answer);
    return answer;
  }

  function load(): Promise<Counts> {
    if (reading !== undefined) {
      again = true;
      return reading;
    }

    reading = read().finally(() => {
      reading = undefined;
      if (!again) return;
      again = false;
      void load().catch(() => undefined);
    });
    return reading;
  }

  return {
    queue: derived(held.changes, (counts) => counts?.queue),
    load,
    stale: () => void load().catch(() => undefined),
  };
}
