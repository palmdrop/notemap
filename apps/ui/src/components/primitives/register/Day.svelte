<script lang="ts">
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
</script>

<!-- A day is a region of the register, so it takes the rule a region does, and
     holds at the top while its rows scroll beneath it. -->
<div
  data-day={dayOf(at)}
  class="sticky top-0 z-10 col-span-full flex items-baseline gap-x-[2ch] border-b border-ink bg-ground pt-5 pb-1 tabular-nums max-narrow:pt-4"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
>
  <time datetime={dayOf(at)} class="font-semibold">{dayOf(at)}</time>
  <span>{weekdayOf(at)}</span>
</div>
