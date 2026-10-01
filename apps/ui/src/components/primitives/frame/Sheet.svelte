<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `fills` makes the sheet the viewport rather than a page that scrolls: the
   * process surface keeps its head and foot in place and scrolls its middle.
   */
  let { fills = false, children }: { fills?: boolean; children: Snippet } =
    $props();
</script>

<!-- The foot clears the status line, so the last row is never under it. -->
<div
  class="overflow-x-clip px-8 max-narrow:px-3.5 {fills
    ? 'flex h-[calc(100dvh-var(--spacing-status))] flex-col'
    : 'min-h-screen pb-24'}"
>
  {@render children()}
</div>
