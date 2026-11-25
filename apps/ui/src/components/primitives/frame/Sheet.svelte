<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `fills` makes the sheet the viewport rather than a page that scrolls: the
   * process surface and the capture page keep their head and foot in place
   * and scroll their middle.
   */
  let {
    fills = false,
    bleeds = false,
    children,
  }: { fills?: boolean; bleeds?: boolean; children: Snippet } = $props();
</script>

<!-- The foot clears the + and the status line, so the last row is never under them. -->
<div
  class="overflow-x-clip {bleeds ? '' : 'px-8 max-wide:px-3.5'} {fills
    ? 'flex min-h-0 flex-1 flex-col'
    : 'pb-24'}"
>
  {@render children()}
</div>
