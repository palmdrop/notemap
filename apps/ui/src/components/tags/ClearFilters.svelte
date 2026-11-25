<script lang="ts">
  import type { Filter } from "@notemap/client";
  import { filterSize } from "@notemap/client";

  import Box from "$components/primitives/blocks/Box.svelte";

  /** The way back to the whole list, named for what is narrowing it. */
  let { filter, onclick }: { filter: Filter; onclick?: () => void } = $props();

  const label = $derived(
    filterSize(filter) === 0
      ? "Clear search"
      : filter.words.length === 0
        ? "Clear filter"
        : "Clear search and filter",
  );
</script>

<span class="mt-3 block">
  <Box {onclick}>{label}</Box>
</span>
