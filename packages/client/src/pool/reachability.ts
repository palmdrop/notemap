import type { Observable } from "rxjs";

import { writable } from "../observable/observable";

/** How soon a pool that has just failed is asked again, and the ceiling it backs off to. */
const SOONEST = 1_000;
const SLOWEST = 30_000;

export type Reachability = {
  /**
   * Whether the pool is answering. Optimistic to begin with and corrected by
   * the first thing that asks, because a client with nothing to send has no
   * evidence either way and refusing to guess would only draw a mark nobody
   * can act on.
   */
  readonly changes: Observable<boolean>;
  /** What a real request reports. Every one of them is evidence; nothing else is. */
  answered(reached: boolean): void;
  /** Asks now rather than waiting for the backoff to. */
  ask(): Promise<void>;
};

/**
 * Reach as the requests themselves report it, with a probe behind it so that a
 * pool which went away is noticed and one that came back drives the outbox
 * without a person prodding it. The probe runs **only while the pool is out of
 * reach**: that is the only state whose ending nobody else would notice, and a
 * client that is answering already has better evidence than a poll.
 */
export function reachability(probe: () => Promise<boolean>): Reachability {
  const reached = writable(true);
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let backoff = SOONEST;

  function settle(answered: boolean): void {
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
    settle(await probe().catch(() => false));
  }

  return { changes: reached.changes, answered: settle, ask };
}
