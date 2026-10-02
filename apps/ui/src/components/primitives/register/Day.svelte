<script lang="ts">
  import type { Attachment } from "svelte/attachments";

  import { dayOf, weekdayOf } from "$lib/stamp";
  import { slide } from "$lib/motion";

  import { band, watch } from "./stuck.svelte";

  let {
    at,
    leads = false,
    motion,
  }: {
    /** Any time in the day it heads. */
    at: string;
    /** The list's first, drawn on the list head's line rather than under it. */
    leads?: boolean;
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

  const stick: Attachment<HTMLElement> = (node) => {
    const stop = watch(node, (now) => {
      stuck = now;
      band.hold(node, now);
    });
    return () => {
      stop();
      band.hold(node, false);
    };
  };
</script>

<!-- A day is a region of the register, so it takes the rule a region does, and
     holds at the top while its rows scroll beneath it. -->
<div
  data-day={dayOf(at)}
  data-stuck={stuck ? "" : undefined}
  data-leads={leads ? "" : undefined}
  class="sticky top-0 z-10 col-span-full {leads
    ? '-mt-day-head'
    : 'mt-3.5'} flex h-day-head items-center gap-x-[2ch] border-b border-ink bg-ground tabular-nums"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
  {@attach stick}
>
  <time datetime={dayOf(at)} class="font-semibold">{dayOf(at)}</time>
  <span class="max-narrow:hidden">{weekdayOf(at)}</span>
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
