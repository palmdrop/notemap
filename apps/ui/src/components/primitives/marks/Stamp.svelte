<script lang="ts">
  import type { Snippet } from "svelte";

  import { dayOf, timeOf } from "$lib/stamp";

  /** The state word, where the surface has one to say. */
  let { at, children }: { at: string; children?: Snippet } = $props();
</script>

<!-- On one column the stamp is a header line across the whole row. -->
<div class="col-start-1 font-mono max-narrow:col-span-full">
  <time datetime={at} class="block whitespace-nowrap max-narrow:inline">
    {dayOf(at)}
  </time>
  <span class="block whitespace-nowrap max-narrow:ml-[1ch] max-narrow:inline">
    {timeOf(at)}
  </span>
  {@render children?.()}
</div>
