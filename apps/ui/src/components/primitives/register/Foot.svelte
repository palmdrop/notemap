<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[var(--spacing-gutter)_1fr] gap-x-gap pt-6 font-mono max-narrow:grid-cols-[1fr]"
>
  <span></span>
  <span>{@render children()}</span>
</div>
