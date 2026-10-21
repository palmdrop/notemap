<script lang="ts">
  import { isWhole, WHOLE, type Filter } from "@notemap/client";

  import ClearFilters from "$components/tags/ClearFilters.svelte";
  import { nameOf } from "$lib/destinations";
  import { nothingMatches, QUEUE_EMPTY } from "$lib/said";

  /**
   * Reaching the end is what the queue is for, so it is said once, quietly,
   * where the rows were. No count, because the pool gives none. Filtered, it
   * says what is not waiting, and never that the queue is empty.
   */
  let {
    filter = WHOLE,
    onwhole,
  }: {
    filter?: Filter;
    onwhole?: () => void;
  } = $props();
</script>

<div>
  {#if isWhole(filter)}
    {QUEUE_EMPTY}
  {:else}
    {nothingMatches(filter, nameOf)}
    <ClearFilters onclick={onwhole} />
  {/if}
</div>
