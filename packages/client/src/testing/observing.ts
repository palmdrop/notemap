import type { Observable } from "rxjs";

/** What an observable holds right now: every source here replays to a subscriber. */
export function read<T>(source: Observable<T>): T {
  let seen: T | undefined;
  source
    .subscribe((value) => {
      seen = value;
    })
    .unsubscribe();
  return seen as T;
}

/**
 * A client begins work nobody holds a promise for, so a test waits on the
 * effect. The budget is a deadline rather than a count of turns, because how
 * many turns a loaded machine gets through says nothing about the client.
 */
export async function until(
  reached: () => boolean | Promise<boolean>,
  patienceMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + patienceMs;

  while (!(await reached())) {
    if (Date.now() > deadline) {
      throw new Error(
        `waited ${patienceMs}ms for something that never happened`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
