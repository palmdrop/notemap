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

/** A client begins work nobody holds a promise for, so a test waits on the effect. */
export async function until(
  reached: () => boolean | Promise<boolean>,
): Promise<void> {
  for (let tries = 0; tries < 50 && !(await reached()); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
