import { onMount, tick } from "svelte";

let holding = $state(0);

/** Whether a surface is drawing what it held back until it was shown. */
export const drawing = {
  get now(): boolean {
    return holding > 0;
  },
};

export type Shown = {
  /** Whether what was held back may be drawn. */
  readonly ready: boolean;
  /** Settled once it is drawn: a place in it can be scrolled to. */
  readonly drawn: Promise<void>;
};

/**
 * Holds a long list back until its surface has been on screen once, so a move
 * to it lands at once and says it is drawing, rather than standing still while
 * hundreds of rows are built. Called while a component is being set up.
 */
export function shownFirst(long: boolean): Shown {
  let ready = $state(!long);
  let settle: () => void = () => undefined;
  const drawn = new Promise<void>((done) => (settle = done));

  if (!long) settle();
  else {
    onMount(() => {
      holding += 1;
      let held = true;
      const letGo = () => {
        if (!held) return;
        held = false;
        holding -= 1;
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The frame is the one the surface is painted in; the task after it is
      // the first that comes once it is on screen.
      const frame = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          ready = true;
          void tick().then(() => {
            letGo();
            settle();
          });
        });
      });
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        letGo();
      };
    });
  }

  return {
    get ready() {
      return ready;
    },
    drawn,
  };
}
