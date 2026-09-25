<script lang="ts">
  import { moving } from "./moving.svelte";

  let {
    reading,
    items,
    answered = false,
    seen,
  }: {
    reading: boolean;
    items: readonly string[];
    /** Whether what is drawn is the pool's own answer rather than a cache or nothing yet. */
    answered?: boolean;
    /** Every row that moved or stood still, and which. */
    seen: { item: string; still: boolean }[];
  } = $props();

  const list = moving(
    () => reading,
    () => items.length,
    () => answered,
  );

  function probe(node: Element, still: boolean) {
    seen.push({ item: node.textContent ?? "", still });
    return {};
  }
</script>

{#each items as item (item)}
  <div transition:probe={list.still}>{item}</div>
{/each}
