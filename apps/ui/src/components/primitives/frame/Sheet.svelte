<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `fills` makes the sheet the viewport rather than a page that scrolls: the
   * process surface keeps its head and foot in place and scrolls its middle.
   */
  let { fills = false, children }: { fills?: boolean; children: Snippet } =
    $props();
</script>

<!-- The deep foot leaves the last row reachable above a corner refusal. -->
<div
  class="px-8 max-narrow:px-3.5 {fills
    ? 'flex h-dvh flex-col'
    : 'min-h-screen pb-32'}"
>
  {@render children()}
</div>
