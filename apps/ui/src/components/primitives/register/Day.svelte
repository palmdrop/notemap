<script lang="ts">
  import type { Attachment } from "svelte/attachments";

  import { dayOf, weekdayOf } from "$lib/stamp";
  import { slide } from "$lib/motion";

  import { band, watch } from "./stuck.svelte";

  let {
    at,
    count,
    leads = false,
    motion,
  }: {
    /** Any time in the day it heads. */
    at: string;
    /** How many rows it heads. */
    count?: number;
    /** The list's first, drawn on the list head's line rather than under it. */
    leads?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
  } = $props();

  /** Held under the header while its rows scroll beneath it. */
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
  class="sticky top-bar z-10 col-span-full flex min-h-9 items-center gap-3 border-y border-rule bg-band px-gutter tabular-nums {leads
    ? ''
    : '-mt-px'}"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
  {@attach stick}
>
  <span class="font-display text-weekday lowercase">{weekdayOf(at)}</span>
  <time datetime={dayOf(at)}>{dayOf(at)}</time>
  {#if count !== undefined}
    <span
      aria-label={`${String(count)} on this day`}
      class="ml-auto grid h-[1.625rem] min-w-[1.625rem] place-items-center rounded-full border border-rule bg-paper px-1.5"
      >{count}</span
    >
  {/if}
</div>
