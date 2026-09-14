<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="flex h-12 flex-none items-baseline justify-between gap-x-6 border-b border-ink pt-2 max-narrow:gap-x-4"
>
  {@render children()}
</div>
