import type { Observable } from "rxjs";

import { writable } from "../observable/observable";

const SOONEST = 1_000;
const SLOWEST = 10_000;
const STEADY = 10_000;

export type Reachability = {
  readonly changes: Observable<boolean>;
  answered(reached: boolean): void;
  ask(): Promise<void>;
  watched(yes: boolean): void;
  stop(): void;
};

export function reachability(probe: () => Promise<boolean>): Reachability {
  const reached = writable(true);
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let backoff = SOONEST;
  let stopped = false;
  let watching = true;

  function settle(answered: boolean): void {
    if (stopped) return;

    const changed = reached.get() !== answered;

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

    if (changed) reached.set(answered);
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
    settle(await probe().catch(() => false));
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
