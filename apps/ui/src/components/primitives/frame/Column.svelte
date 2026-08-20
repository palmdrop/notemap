<script lang="ts">
  import type { Snippet } from "svelte";

  /** A composer needs room beside the register; nothing else widens the page. */
  let { wide = false, children }: { wide?: boolean; children: Snippet } =
    $props();
</script>

<div
  class="mx-auto {wide
    ? 'max-w-[calc(var(--spacing-measure)+var(--spacing-panel))]'
    : 'max-w-[var(--spacing-measure)]'}"
>
  {@render children()}
</div>
