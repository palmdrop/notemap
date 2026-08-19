<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="relative grid grid-cols-[var(--spacing-gutter)_1fr] gap-x-gap gap-y-3 py-6 max-narrow:grid-cols-[max-content_1fr] max-narrow:gap-y-2"
>
  {@render children()}
</div>
