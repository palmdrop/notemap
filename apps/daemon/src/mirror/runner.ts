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

/** The host drives *when*; core owns the state. This holds a timer and nothing else. */
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

      // Gone means nothing left to mirror; removing its files is purge's job.
      const record = await pool.mirror.recordFor(lease.job.subject);
      if (record !== undefined) await writer.write(record);
      return { kind: "succeeded" };
    } catch (cause) {
      return asWorkOutcome(cause);
    }
  }

  async function runOnce(): Promise<number> {
    // One attempt per job per drain: a zero backoff would otherwise let a
    // failing job be reclaimed inside this same loop, forever.
    const attempted = new Set<string>();
    let resolved = 0;

    while (true) {
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

  /**
   * One drain at a time: a slow disk must not stack ticks on top of each other.
   *
   * A caller arriving mid-tick waits for that tick *and then a fresh one*, so
   * `drain()` means "everything owed when I asked is written". The running tick
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
    void next().catch(onError);
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
