<script lang="ts">
  import type { Snippet } from "svelte";

  let { fills = false, children }: { fills?: boolean; children: Snippet } =
    $props();
</script>

<div
  class="mx-auto w-full max-w-measure {fills
    ? 'flex min-h-0 flex-1 flex-col'
    : ''}"
>
  {@render children()}
</div>
