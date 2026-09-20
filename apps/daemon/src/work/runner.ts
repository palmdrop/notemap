import type {
  Duration,
  JobKind,
  Lease,
  Pool,
  WorkOutcome,
} from "@notemap/core";

import { silentLogger, type Logger } from "../log";

export type RunnerConfig = {
  readonly pollIntervalMs: number;
  readonly leaseForMs: Duration;
  readonly batch: number;
};

export type Runner = {
  /** Runs every claimable job now, and answers how many it resolved. */
  drain(): Promise<number>;
  stop(): Promise<void>;
};

/** What a job of these kinds actually does. Never throws: a throw is a bug, not an outcome. */
export type Perform = (lease: Lease) => Promise<WorkOutcome>;

/**
 * The host drives *when*; core owns the state. This holds a timer and nothing
 * else — which job is next, whether a failure retries and when, and when work
 * is given up on are all core's.
 */
export function startRunner(
  pool: Pool,
  kinds: readonly JobKind[],
  perform: Perform,
  config: RunnerConfig,
  log: Logger = silentLogger(),
): Runner {
  let inFlight: Promise<number> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function runOnce(): Promise<number> {
    // One attempt per job per drain: a zero backoff would otherwise let a
    // failing job be reclaimed inside this same loop, forever.
    const attempted = new Set<string>();
    let resolved = 0;

    while (true) {
      const leases = await pool.work.claim({
        kinds,
        limit: config.batch,
        leaseFor: config.leaseForMs,
      });

      const fresh: Lease[] = [];
      for (const lease of leases) {
        if (attempted.has(lease.job.id)) await pool.work.release(lease.id);
        else fresh.push(lease);
      }

      if (fresh.length === 0) return resolved;

      for (const lease of fresh) {
        attempted.add(lease.job.id);
        const outcome = await perform(lease);
        await pool.work.complete(lease.id, outcome);
        resolved += 1;
        log.debug(
          { job: lease.job.id, kind: lease.job.kind, outcome: outcome.kind },
          "job resolved",
        );
      }
    }
  }

  /**
   * One drain at a time: a slow disk must not stack ticks on top of each other.
   *
   * A caller arriving mid-tick waits for that tick *and then a fresh one*, so
   * `drain()` means "everything owed when I asked is done". The running tick
   * may have claimed before their work was enqueued, and answering with it
   * would report a drain that could not have seen them.
   */
  function drain(): Promise<number> {
    return (inFlight ?? Promise.resolve(0)).then(next, next);
  }

  function next(): Promise<number> {
    inFlight ??= runOnce().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  const tick = () => {
    if (stopped) return;
    // The timer wants a drain, not a *fresh* drain — one already running is
    // exactly what this tick would have started.
    void next().catch((cause: unknown) =>
      log.error({ err: cause, kinds }, "a work runner's pass threw"),
    );
  };

  timer = setInterval(tick, config.pollIntervalMs);
  timer.unref?.();

  return {
    drain,
    stop: async () => {
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await inFlight?.catch(() => undefined);
    },
  };
}

/** A job of a kind that cannot be about this subject: a bug, not something to retry. */
export function wrongSubject(lease: Lease): WorkOutcome {
  return {
    kind: "failed",
    retryable: false,
    detail: {
      code: "wrong-subject",
      detail: `a ${lease.job.kind} job about a ${lease.job.subject.kind}`,
    },
  };
}
