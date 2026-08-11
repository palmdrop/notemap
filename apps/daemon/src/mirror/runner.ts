import {
  asWorkOutcome,
  type Duration,
  type JobKind,
  type Lease,
  type MirrorWriter,
  type Pool,
  type WorkOutcome,
} from "@notemap/core";

const KINDS: readonly JobKind[] = ["mirror", "mirror-remove"];

export type MirrorRunnerConfig = {
  readonly pollIntervalMs: number;
  readonly leaseForMs: Duration;
  readonly batch: number;
};

export type MirrorRunner = {
  /** Runs every claimable job now, and answers how many it resolved. */
  drain(): Promise<number>;
  stop(): Promise<void>;
};

/**
 * The host drives *when*; core owns the state. This holds a timer and nothing
 * else — which job is next, whether a failure retries and when, are all
 * answered by `claim` and `complete`.
 */
export function startMirrorRunner(
  pool: Pool,
  writer: MirrorWriter,
  config: MirrorRunnerConfig,
  onError: (cause: unknown) => void = (cause) => console.error(cause),
): MirrorRunner {
  let inFlight: Promise<number> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function perform(lease: Lease): Promise<WorkOutcome> {
    try {
      if (lease.job.kind === "mirror-remove") {
        await writer.remove(lease.job.subject);
        return { kind: "succeeded" };
      }

      const record = await pool.mirror.recordFor(lease.job.subject);
      // The item is gone, so there is nothing left to mirror. Removing its
      // files is a separate job that purge owes.
      if (record !== undefined) await writer.write(record);
      return { kind: "succeeded" };
    } catch (cause) {
      return asWorkOutcome(cause);
    }
  }

  async function runOnce(): Promise<number> {
    // A job whose backoff is zero would otherwise be claimed again inside the
    // same drain, forever. One attempt per job per drain, and the next tick
    // picks it up when it is due.
    const attempted = new Set<string>();
    let resolved = 0;

    for (;;) {
      const leases = await pool.work.claim({
        kinds: KINDS,
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
        await pool.work.complete(lease.id, await perform(lease));
        resolved += 1;
      }
    }
  }

  /** One drain at a time: a slow disk must not stack ticks on top of each other. */
  function drain(): Promise<number> {
    inFlight ??= runOnce().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  const tick = () => {
    if (stopped) return;
    void drain().catch(onError);
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
