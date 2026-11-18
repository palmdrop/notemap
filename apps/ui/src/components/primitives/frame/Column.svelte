<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `fills` is the process surface, which scrolls inside itself. A list runs
   * the width of its pane, its rows keeping their own measure.
   */
  let {
    fills = false,
    list = false,
    children,
  }: { fills?: boolean; list?: boolean; children: Snippet } = $props();
</script>

<div
  class="w-full {fills ? 'flex min-h-0 flex-1 flex-col' : ''} {list
    ? ''
    : 'max-w-measure'}"
>
  {@render children()}
</div>
