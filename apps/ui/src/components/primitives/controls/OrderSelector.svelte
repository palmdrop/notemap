<script lang="ts">
  import type { Key, Order } from "@notemap/client";

  import Segmented from "$components/primitives/blocks/Segmented.svelte";

  /**
   * Held while a read is walking: the surface cannot turn around until that one
   * lands, and a control showing an order the surface is not in would lie.
   *
   * `keyed` offers the key as well as the end, which only the feed has.
   */
  let {
    order,
    by = "capture",
    keyed = false,
    reading = false,
    onchoose,
  }: {
    order: Order;
    by?: Key;
    keyed?: boolean;
    reading?: boolean;
    onchoose: (order: Order, by: Key) => void;
  } = $props();

  const ENDS: readonly { value: Order; word: string }[] = [
    { value: "oldest-first", word: "Oldest first" },
    { value: "newest-first", word: "Newest first" },
  ];

  const KEYS: readonly { value: Key; word: string }[] = [
    { value: "capture", word: "When captured" },
    { value: "processed", word: "When processed" },
  ];
</script>

<div class="flex flex-col gap-2">
  <Segmented
    label="Order"
    value={order}
    options={ENDS}
    disabled={reading}
    onchoose={(end) => onchoose(end, keyed ? by : "capture")}
  />
  {#if keyed}
    <Segmented
      label="Ordered by"
      value={by}
      options={KEYS}
      disabled={reading}
      onchoose={(key) => onchoose(order, key)}
    />
  {/if}
</div>
