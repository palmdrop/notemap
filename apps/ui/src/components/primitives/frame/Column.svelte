<script lang="ts">
  import type { Snippet } from "svelte";

  /** `fills` is the process surface, which scrolls inside itself. */
  let { fills = false, children }: { fills?: boolean; children: Snippet } =
    $props();
</script>

<div
  class="mx-auto w-full {fills
    ? 'flex min-h-0 flex-1 flex-col'
    : ''} max-w-measure"
>
  {@render children()}
</div>
