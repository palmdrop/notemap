<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A row's actions are not six of a kind: the first line is how an item leaves
   * the queue, the second is working with the one in front of you, quietly.
   * Every cell takes the same inline padding — the padding the accent fill needs
   * — so the words align down the columns and not merely the boxes, and a line
   * with fewer of them closes up rather than leaving a hole.
   */
  let { leaving, working }: { leaving: Snippet; working: Snippet } = $props();
</script>

<div
  class="mt-3.5 grid w-max grid-cols-[repeat(3,max-content)] gap-y-1 font-mono"
>
  <div
    class="col-span-full grid grid-cols-subgrid items-baseline gap-x-4 *:px-2.5"
  >
    {@render leaving()}
  </div>
  <div
    class="col-span-full grid grid-cols-subgrid items-baseline gap-x-4 text-ink-muted *:px-2.5"
  >
    {@render working()}
  </div>
</div>
