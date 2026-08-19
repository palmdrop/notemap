<script lang="ts">
  export type Order = "oldest-first" | "newest-first";

  let {
    order,
    onchoose,
  }: { order: Order; onchoose: (order: Order) => void } = $props();

  const words: Record<Order, string> = {
    "oldest-first": "oldest",
    "newest-first": "newest",
  };
</script>

<!-- Which end a reader starts from is the reader's, on both surfaces. -->
<div class="flex justify-end pt-3.5 pb-1 font-mono max-narrow:pr-0">
  <label class="flex items-baseline gap-1">
    <select
      value={order}
      aria-label="Order"
      onchange={(event) => onchoose(event.currentTarget.value as Order)}
      class="cursor-pointer appearance-none bg-transparent font-mono"
    >
      {#each Object.entries(words) as [value, word] (value)}
        <option {value}>{word}</option>
      {/each}
    </select>
    <span aria-hidden="true">▾</span>
  </label>
</div>
