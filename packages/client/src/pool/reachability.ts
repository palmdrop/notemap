import type { Observable } from "rxjs";

import { writable } from "../observable/observable";

const SOONEST = 1_000;
const SLOWEST = 30_000;

export type Reachability = {
  readonly changes: Observable<boolean>;
  answered(reached: boolean): void;
  ask(): Promise<void>;
  stop(): void;
};

export function reachability(probe: () => Promise<boolean>): Reachability {
  const reached = writable(true);
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let backoff = SOONEST;
  let stopped = false;

  function settle(answered: boolean): void {
    if (stopped) return;

    if (answered) {
      backoff = SOONEST;
      clearTimeout(waiting);
      waiting = undefined;
    } else if (waiting === undefined) {
      again();
    }

    if (reached.get() !== answered) reached.set(answered);
  }

  function again(): void {
    const wait = backoff;
    backoff = Math.min(backoff * 2, SLOWEST);

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
    stop() {
      stopped = true;
      clearTimeout(waiting);
      waiting = undefined;
    },
  };
}
