import { SvelteSet } from "svelte/reactivity";
import { on } from "svelte/events";

type Watched = {
  readonly node: HTMLElement;
  readonly tell: (stuck: boolean) => void;
};

const watched: Watched[] = [];
let queued = false;
let stop: (() => void) | undefined;

/**
 * Read on every scroll, so a jump that lands a heading in the band — a
 * reload, `j`, the end of the page — is seen as surely as a slow scroll.
 */
function measure(): void {
  queued = false;
  for (const { node, tell } of watched) {
    const at = node.getBoundingClientRect();
    tell(at.top < at.height && at.bottom > 0);
  }
}

function soon(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(measure);
}

/** Tells `tell` whether `node` is in the band at the top that a sticky thing holds. */
export function watch(
  node: HTMLElement,
  tell: (stuck: boolean) => void,
): () => void {
  const one = { node, tell };
  watched.push(one);
  if (stop === undefined) {
    const scrolled = on(window, "scroll", soon, { passive: true });
    const resized = on(window, "resize", soon);
    stop = () => {
      scrolled();
      resized();
    };
  }
  soon();
  return () => {
    watched.splice(watched.indexOf(one), 1);
    if (watched.length > 0) return;
    stop?.();
    stop = undefined;
  };
}

const dating = new SvelteSet<HTMLElement>();

/** The day headings in the band, which the list head lets show through it. */
export const band = {
  get dated(): boolean {
    return dating.size > 0;
  },
  hold(node: HTMLElement, stuck: boolean): void {
    if (stuck) dating.add(node);
    else dating.delete(node);
  },
};
