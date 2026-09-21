import type { AssetId, Pool } from "@notemap/core";

import { silentLogger, type Logger } from "../log";

export type SweeperConfig = {
  readonly intervalMs: number;
};

export type Sweeper = {
  /** Runs a sweep now, and answers what it took. */
  run(): Promise<readonly AssetId[]>;
  stop(): Promise<void>;
};

/**
 * The host drives *when*; the grace window and what counts as unreferenced are
 * core's. This holds a timer and nothing else.
 *
 * Nothing waits on a sweep — the space it frees was already wasted — so a run
 * that overlaps a tick is skipped rather than queued.
 */
export function startSweeper(
  pool: Pool,
  config: SweeperConfig,
  log: Logger = silentLogger(),
): Sweeper {
  let inFlight: Promise<readonly AssetId[]> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function run(): Promise<readonly AssetId[]> {
    // Stopping is what the host does before closing the pool, so a run started
    // afterwards would reach a store that has gone.
    if (stopped) return Promise.resolve([]);

    inFlight ??= pool.maintenance
      .sweepUnreferencedAssets()
      .then((released) => {
        log[released.length === 0 ? "debug" : "info"](
          { released: released.length },
          "swept assets no item ever referenced",
        );
        return released;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  timer = setInterval(() => {
    void run().catch((cause: unknown) =>
      log.error({ err: cause }, "the sweep threw"),
    );
  }, config.intervalMs);
  timer.unref?.();

  return {
    run,
    stop: async () => {
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await inFlight?.catch(() => undefined);
    },
  };
}
