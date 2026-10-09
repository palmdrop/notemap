import { tick, untrack } from "svelte";

type Anchor = { readonly id: string; readonly top: number };

function rowOf(id: string): HTMLElement | undefined {
  return (
    document.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`) ??
    undefined
  );
}

/** The first row the reader can see any of, and where it stands. */
function inView(ids: readonly string[]): Anchor | undefined {
  for (const id of ids) {
    const box = rowOf(id)?.getBoundingClientRect();
    if (box !== undefined && box.bottom > 0) return { id, top: box.top };
  }
  return undefined;
}

/**
 * Holds the row a reader is looking at where it stands on the screen while
 * rows arrive above it. A browser that anchors scrolling has already done so,
 * and finds nothing to correct; Safari does not. The correction lands before
 * the frame is painted, so the page never shows the row anywhere else.
 *
 * A row arriving above the reader arrives still: nobody sees it, and its slide
 * would move the page under them a frame at a time. A read is left alone — a
 * page, a re-read, a turned order places the reader on purpose — and so is a
 * reader at the head, who is meant to see a row arrive.
 */
export function anchored(
  ids: () => readonly string[],
  moving: { readonly still: boolean },
): { readonly still: boolean } {
  let was = untrack(ids);
  let held: Anchor | undefined;
  let unseen = false;

  $effect.pre(() => {
    const now = ids();
    const before = was;
    was = now;
    held = undefined;
    if (moving.still || window.scrollY <= 0) return;

    held = inView(before);
    if (held === undefined) return;

    const at = now.indexOf(held.id);
    unseen = now.slice(0, Math.max(at, 0)).some((id) => !before.includes(id));
  });

  $effect(() => {
    ids();
    const anchor = held;
    held = undefined;
    if (anchor === undefined) return;

    const top = rowOf(anchor.id)?.getBoundingClientRect().top;
    if (top !== undefined && top !== anchor.top) {
      window.scrollBy(0, top - anchor.top);
    }
    if (unseen) void tick().then(() => (unseen = false));
  });

  return {
    get still() {
      return moving.still || unseen;
    },
  };
}
