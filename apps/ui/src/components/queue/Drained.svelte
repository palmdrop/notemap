<script lang="ts">
  import { everyOf } from "$lib/said";

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

<div
  class="pt-8 pl-[calc(var(--spacing-rail)+var(--spacing-gutter))] max-narrow:pl-[calc(var(--spacing-rail-narrow)+0.875rem)]"
>
  {#if filter.length === 0}
    Nothing left to process.
  {:else}
    Nothing tagged {everyOf(filter)} is waiting.
    <button type="button" class="ml-[1ch] hover:underline" onclick={onwhole}>
      whole queue
    </button>
  {/if}
</div>
