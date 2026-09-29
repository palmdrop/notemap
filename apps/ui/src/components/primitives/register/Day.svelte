<script lang="ts" module>
  import { on } from "svelte/events";

  /** The heading's own height, `h-12`, which a row walked to clears by `scroll-mt-12`. */
  const BAND = 48;

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
      tell(at.top < BAND && at.bottom > 0);
    }
  }

  function soon(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(measure);
  }

  function watch(node: HTMLElement, tell: (stuck: boolean) => void) {
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
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";

  import { dayOf, weekdayOf } from "$lib/stamp";
  import { slide } from "$lib/motion";

  let {
    at,
    motion,
  }: {
    /** Any time in the day it heads. */
    at: string;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
  } = $props();

  /**
   * Held at the top, the heading is what a selected row's box scrolls under,
   * and the box reaches past the columns: so, stuck, it spans the screen. It
   * spans it from the moment it reaches the band a stuck heading holds, so
   * the next day's heading covers the last one edge to edge as it slides
   * over it.
   */
  let stuck = $state(false);

  const stick: Attachment<HTMLElement> = (node) =>
    watch(node, (now) => (stuck = now));
</script>

<!-- A day is a region of the register, so it takes the rule a region does, and
     holds at the top while its rows scroll beneath it. -->
<div
  data-day={dayOf(at)}
  data-stuck={stuck ? "" : undefined}
  class="sticky top-0 z-10 col-span-full flex h-12 items-baseline gap-x-[2ch] border-b border-ink bg-ground pt-5 tabular-nums"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
  {@attach stick}
>
  <time datetime={dayOf(at)} class="font-semibold">{dayOf(at)}</time>
  <span>{weekdayOf(at)}</span>
</div>

<style>
  [data-stuck]::before {
    content: "";
    position: absolute;
    inset-block: 0 -1px;
    left: calc(50% - 50vw);
    width: 100vw;
    z-index: -1;
    background: var(--color-ground);
    border-bottom: 1px solid var(--color-ink);
  }
</style>
