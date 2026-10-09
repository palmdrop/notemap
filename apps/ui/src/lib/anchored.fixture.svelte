<script lang="ts">
  import { anchored } from "./anchored.svelte";

  let {
    items,
    reading = false,
    seen,
  }: {
    items: readonly string[];
    /** Whether this update is a read, which places the reader on purpose. */
    reading?: boolean;
    /** Every row that arrived, and whether it slid. */
    seen: { item: string; still: boolean }[];
  } = $props();

  const list = anchored(() => items, {
    get still() {
      return reading;
    },
  });

  function probe(node: Element, still: boolean) {
    seen.push({ item: node.textContent ?? "", still });
    return {};
  }
</script>

{#each items as item (item)}
  <div data-row={item} transition:probe={list.still}>{item}</div>
{/each}
