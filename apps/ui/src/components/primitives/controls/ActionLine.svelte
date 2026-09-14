<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * An opened row's actions, on one line. They were two — how an item leaves
   * the queue, and working with the one in front of you — which was the split a
   * set of six of unclear rank needed. There is one way out of the queue now,
   * and a second line for three quiet controls said more about the layout than
   * about the row.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-3.5 flex w-max flex-wrap items-baseline gap-x-5">
  {@render children()}
</div>
