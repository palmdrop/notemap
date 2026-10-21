<script lang="ts">
  import type { Key, Order } from "@notemap/client";

  import Chooser from "$components/primitives/controls/Chooser.svelte";

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

  type Choice = `${Order} ${Key}`;

  const ENDS: readonly { value: Choice; word: string }[] = [
    { value: "oldest-first capture", word: "oldest" },
    { value: "newest-first capture", word: "newest" },
  ];

  const KEYED: readonly {
    value: Choice;
    word: string;
    said?: string;
    band: string;
  }[] = [
    { value: "newest-first capture", word: "newest", band: "captured" },
    { value: "oldest-first capture", word: "oldest", band: "captured" },
    {
      value: "newest-first processed",
      word: "latest",
      said: "latest processed",
      band: "processed",
    },
    {
      value: "oldest-first processed",
      word: "earliest",
      said: "earliest processed",
      band: "processed",
    },
  ];

  function choose(choice: Choice): void {
    const [end, key] = choice.split(" ") as [Order, Key];
    onchoose(end, key);
  }
</script>

<Chooser
  label="Order"
  value={`${order} ${keyed ? by : "capture"}` as Choice}
  options={keyed ? KEYED : ENDS}
  disabled={reading}
  onchoose={choose}
/>
