import type { Pool } from "@notemap/core";

import { silentLogger, type Logger } from "@notemap/log";

export type Measuring = {
  /** Lets go of the run where it stands, and waits for it to have. */
  stop(): Promise<void>;
};

/**
 * Measures the pictures stored before the pool measured them, once, as the
 * host starts. Nothing waits on it: a picture without dimensions is drawn all
 * the same.
 */
export function startMeasuring(
  pool: Pool,
  log: Logger = silentLogger(),
): Measuring {
  const stopping = new AbortController();
  const running = pool.maintenance
    .measurePictures(stopping.signal)
    .then((measured) => {
      log[measured === 0 ? "debug" : "info"](
        { measured },
        "measured pictures held without dimensions",
      );
    })
    .catch((cause: unknown) => {
      log.error({ err: cause }, "measuring pictures threw");
    });

  return {
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
}
