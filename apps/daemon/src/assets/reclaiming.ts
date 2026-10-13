import type { Pool, ReclaimOutcome } from "@notemap/core";

import { silentLogger, type Logger } from "@notemap/log";

export type ReclaimingConfig = {
  readonly reclaimIntervalMs: number;
};

export type Reclaiming = {
  /** Runs a reclaim now, and answers what it took. Joins one already in flight. */
  run(): Promise<ReclaimOutcome>;
  /** Lets go of a run where it stands, and waits for it to have. */
  stop(): Promise<void>;
};

/**
 * Reclaims once as the host starts and again on every tick. Nothing waits on
 * it — the space it frees was already wasted — so a tick that overlaps a run
 * is skipped rather than queued.
 */
export function startReclaiming(
  pool: Pool,
  config: ReclaimingConfig,
  log: Logger = silentLogger(),
): Reclaiming {
  const stopping = new AbortController();
  let inFlight: Promise<ReclaimOutcome> | undefined;
  const nothing: ReclaimOutcome = { blobs: 0, bytes: 0 };

  function run(): Promise<ReclaimOutcome> {
    if (stopping.signal.aborted) return Promise.resolve(nothing);

    inFlight ??= pool.maintenance
      .reclaimUnnamedBlobs(stopping.signal)
      .then((took) => {
        log[took.blobs === 0 ? "debug" : "info"](
          took,
          "reclaimed blobs nothing names",
        );
        return took;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  const tick = () => {
    void run().catch((cause: unknown) =>
      log.error({ err: cause }, "the reclaim threw"),
    );
  };

  tick();
  const timer = setInterval(tick, config.reclaimIntervalMs);
  timer.unref?.();

  return {
    run,
    stop: async () => {
      stopping.abort();
      clearInterval(timer);
      await inFlight?.catch(() => undefined);
    },
  };
}
