<script lang="ts">
  import type { Snippet } from "svelte";

  /** `fills` is the process surface, which is wider than a page and scrolls inside itself. */
  let { fills = false, children }: { fills?: boolean; children: Snippet } =
    $props();
</script>

<div
  class="mx-auto w-full {fills
    ? 'flex min-h-0 max-w-measure-wide flex-1 flex-col'
    : 'max-w-measure'}"
>
  {@render children()}
</div>
