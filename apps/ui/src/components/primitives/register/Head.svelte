<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";

  import { band, watch } from "./stuck.svelte";

  /**
   * What a list says about itself before its first row: how it is read. It
   * holds at the top while the rows scroll beneath it, as tall as a day
   * heading so the two share the band: by day, the heading in the band shows
   * through the head's left, and the head draws nothing over it.
   */
  let { children }: { children: Snippet } = $props();

  let stuck = $state(false);

  const stick: Attachment<HTMLElement> = (node) =>
    watch(node, (now) => (stuck = now));

  const covers = $derived(stuck && !band.dated);
</script>

<div
  data-head
  data-covers={covers ? "" : undefined}
  class="sticky top-0 z-20 mt-3.5 flex h-day-head items-center justify-end"
  {@attach stick}
>
  <div class="flex items-baseline gap-x-5 bg-ground pl-[1ch]">
    {@render children()}
  </div>
</div>

<style>
  [data-covers]::before {
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
