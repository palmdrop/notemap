<script lang="ts">
  import type { Order } from "@notemap/client";

  /**
   * Held while a read is walking: the surface cannot turn around until that one
   * lands, and a control showing an order the surface is not in would lie.
   */
  let {
    order,
    reading = false,
    onchoose,
  }: {
    order: Order;
    reading?: boolean;
    onchoose: (order: Order) => void;
  } = $props();

  const words: Record<Order, string> = {
    "oldest-first": "oldest",
    "newest-first": "newest",
  };
</script>

<!-- Which end a reader starts from is the reader's, on both surfaces. -->
<label class="flex items-baseline gap-1">
  <select
    value={order}
    disabled={reading}
    aria-label="Order"
    onchange={(event) => onchoose(event.currentTarget.value as Order)}
    class="cursor-pointer appearance-none bg-transparent font-mono disabled:text-ink-muted"
  >
    {#each Object.entries(words) as [value, word] (value)}
      <option {value}>{word}</option>
    {/each}
  </select>
  <span aria-hidden="true">▾</span>
</label>
