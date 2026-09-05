<script lang="ts">
  import type { Order } from "@notemap/client";

  import Chooser from "$components/primitives/controls/Chooser.svelte";

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

  const ENDS: readonly { value: Order; word: string }[] = [
    { value: "oldest-first", word: "oldest" },
    { value: "newest-first", word: "newest" },
  ];
</script>

<Chooser
  label="Order"
  value={order}
  options={ENDS}
  disabled={reading}
  {onchoose}
/>
