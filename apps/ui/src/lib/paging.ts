import type { ListState } from "@notemap/client";

type Watched = {
  subscribe(next: (state: ListState) => void): { unsubscribe(): void };
};

/** What the surface holds once it is not reading, now or when its read lands. */
export function settled(surface: Watched): Promise<ListState> {
  return new Promise((done) => {
    let over = false;
    let stop: (() => void) | undefined;

    const held = surface.subscribe((state) => {
      if (over || state.loading) return;
      over = true;
      stop?.();
      done(state);
    });

    // The current value arrives during `subscribe`, before `held` exists.
    if (over) held.unsubscribe();
    else stop = () => held.unsubscribe();
  });
}

/**
 * Reads on until there is a row past the one the reader is stepping from. A
 * read already in flight is waited for rather than raced: asking while one is
 * in flight is a no-op that resolves before it lands, and a read may be queued
 * before the surface says it is reading. Stops at the end, on a failure, or
 * once the step is no longer wanted.
 */
export async function readPast(
  surface: Watched,
  load: () => Promise<void>,
  stillWanted: () => boolean,
): Promise<void> {
  for (;;) {
    const state = await settled(surface);
    if (!stillWanted() || !state.more || state.failure !== undefined) return;
    await load();
  }
}
