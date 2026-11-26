<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `fills` makes the sheet the viewport rather than a page that scrolls: the
   * process surface and the capture page keep their head and foot in place
   * and scroll their middle. `clears` keeps room at the foot for the + and the
   * status line, so the last row is never under them; a page with neither
   * ends where its rows do.
   */
  let {
    fills = false,
    bleeds = false,
    clears = true,
    children,
  }: {
    fills?: boolean;
    bleeds?: boolean;
    clears?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  class="overflow-x-clip {bleeds ? '' : 'px-8 max-wide:px-3.5'} {fills
    ? 'flex min-h-0 flex-1 flex-col'
    : clears
      ? 'pb-24'
      : ''}"
>
  {@render children()}
</div>
