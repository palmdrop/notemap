import type { Observable } from "rxjs";

import { writable } from "../observable/observable";

const SOONEST = 1_000;
const SLOWEST = 10_000;
const STEADY = 10_000;

/**
 * Whether the pool is answering, and when it last did. Every request is
 * evidence, not only the probe, which is why the time is worth carrying: a
 * client being used says how long ago it was last answered without ever having
 * sent a probe.
 */
export type Reach = {
  readonly yes: boolean;
  /** Absent until something has answered: the first mark is optimism, not evidence. */
  readonly at?: string;
  /** How long the round trip took, where the probe was the one that measured it. */
  readonly ms?: number;
  /** The daemon's own version, where the probe was what asked — carried forward otherwise. */
  readonly version?: string;
};

export type Reachability = {
  readonly changes: Observable<Reach>;
  answered(reached: boolean): void;
  ask(): Promise<void>;
  watched(yes: boolean): void;
  stop(): void;
};

export function reachability(
  probe: () => Promise<{ readonly yes: boolean; readonly version?: string }>,
  now: () => string,
): Reachability {
  const reached = writable<Reach>({ yes: true });
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let backoff = SOONEST;
  let stopped = false;
  let watching = true;

  function settle(answered: boolean, ms?: number, version?: string): void {
    if (stopped) return;

    const changed = reached.get().yes !== answered;

    if (answered) {
      backoff = SOONEST;
      // Every answer pushes the probe out, so a client whose requests are being
      // answered never sends one.
      again(STEADY);
    } else if (waiting === undefined || changed) {
      const wait = backoff;
      backoff = Math.min(backoff * 2, SLOWEST);
      again(wait);
    }

    // Set on every answer rather than only on a flip: what changed is when it
    // was last answered, which is the whole of what a person reads off it.
    // The version is only ever said by the health probe itself, so an ordinary
    // request's answer carries the last one this learned rather than dropping it.
    const carried = version ?? reached.get().version;
    reached.set({
      yes: answered,
      at: now(),
      ...(ms === undefined ? {} : { ms }),
      ...(carried === undefined ? {} : { version: carried }),
    });
  }

  function again(wait: number): void {
    clearTimeout(waiting);
    waiting = undefined;
    if (!watching) return;

    waiting = setTimeout(() => {
      waiting = undefined;
      void ask();
    }, wait);
  }

  async function ask(): Promise<void> {
    if (stopped) return;

    const from = Date.now();
    const answered = await probe().catch(
      (): { readonly yes: boolean; readonly version?: string } => ({
        yes: false,
      }),
    );
    settle(answered.yes, Date.now() - from, answered.version);
  }

  return {
    changes: reached.changes,
    answered: settle,
    ask,

    watched(yes) {
      if (stopped || yes === watching) return;
      watching = yes;

      if (yes) {
        // Failed requests went on doubling it while nothing was scheduled, and
        // that stretch is one nobody was reading.
        backoff = SOONEST;
        void ask();
      } else {
        clearTimeout(waiting);
        waiting = undefined;
      }
    },

    stop() {
      stopped = true;
      clearTimeout(waiting);
      waiting = undefined;
    },
  };
}
