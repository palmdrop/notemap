<script lang="ts">
  import { moving } from "./moving.svelte";

  let {
    reading,
    items,
    seen,
  }: {
    reading: boolean;
    items: readonly string[];
    /** Every row that moved or stood still, and which. */
    seen: { item: string; still: boolean }[];
  } = $props();

  const list = moving(
    () => reading,
    () => items.length,
  );

  function probe(node: Element, still: boolean) {
    seen.push({ item: node.textContent ?? "", still });
    return {};
  }
</script>

{#each items as item (item)}
  <div transition:probe={list.still}>{item}</div>
{/each}
