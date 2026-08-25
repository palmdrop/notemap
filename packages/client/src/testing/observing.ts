import type { Observable } from "rxjs";

/** What an observable holds right now, which is what a subscription is handed. */
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
 * Lets hydration, a boot drain and everything they start run to a stop. A
 * client begins work nobody holds a promise for, so a test waits on the effect.
 */
export async function until(reached: () => boolean): Promise<void> {
  for (let tries = 0; tries < 50 && !reached(); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
