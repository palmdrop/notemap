<script lang="ts">
  import ClearFilters from "$components/tags/ClearFilters.svelte";
  import { nothingMatches, QUEUE_EMPTY } from "$lib/said";

  /**
   * Reaching the end is what the queue is for, so it is said once, quietly,
   * where the rows were. No count, because the pool gives none. Filtered, it
   * says what is not waiting, and never that the queue is empty.
   */
  let {
    filter = [],
    onwhole,
  }: {
    filter?: readonly string[];
    onwhole?: () => void;
  } = $props();
</script>

<div>
  {#if filter.length === 0}
    {QUEUE_EMPTY}
  {:else}
    {nothingMatches(filter)}
    <ClearFilters onclick={onwhole} />
  {/if}
</div>
