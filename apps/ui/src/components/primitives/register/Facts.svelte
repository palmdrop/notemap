<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- The label column is shared, so it fits the longest name here rather than a
     width guessed for the shortest. -->
<div
  class="mt-4 grid grid-cols-[minmax(var(--spacing-fact),auto)_1fr] gap-x-2.5 gap-y-1
    max-narrow:grid-cols-[1fr] max-narrow:gap-x-0"
>
  {@render children()}
</div>
