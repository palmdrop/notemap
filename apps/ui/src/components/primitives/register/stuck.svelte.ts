import { SvelteSet } from "svelte/reactivity";
import { on } from "svelte/events";

type Watched = {
  readonly node: HTMLElement;
  readonly tell: (stuck: boolean) => void;
  /**
   * Where it holds: its sticky `top`, read in the frame that measures, with
   * every other heading, rather than as it is drawn among the rows.
   */
  at?: number;
};

const holdsAt = (node: HTMLElement): number =>
  Number.parseFloat(getComputedStyle(node).top) || 0;

const watched: Watched[] = [];
let queued = false;
let stop: (() => void) | undefined;

/**
 * Read on every scroll, so a jump that lands a heading in the band — a
 * reload, `j`, the end of the page — is seen as surely as a slow scroll.
 */
function measure(): void {
  queued = false;
  for (const one of watched) {
    one.at ??= holdsAt(one.node);
    const box = one.node.getBoundingClientRect();
    one.tell(box.top < one.at + 1 && box.bottom > one.at);
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
  const one: Watched = { node, tell };
  watched.push(one);
  if (stop === undefined) {
    const scrolled = on(window, "scroll", soon, { passive: true });
    const resized = on(window, "resize", () => {
      for (const each of watched) each.at = undefined;
      soon();
    });
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

/** The day headings held in the band at the top. */
export const band = {
  /**
   * The heading the band shows: the last of those held there. One that went
   * before it is under it, and is hidden rather than left to show at an edge.
   */
  get shown(): HTMLElement | undefined {
    let last: HTMLElement | undefined;
    for (const node of dating) {
      if (
        last === undefined ||
        last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        last = node;
      }
    }
    return last;
  },
  hold(node: HTMLElement, stuck: boolean): void {
    if (stuck) dating.add(node);
    else dating.delete(node);
  },
};
