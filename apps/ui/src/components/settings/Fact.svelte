<script lang="ts">
  import type { Snippet } from "svelte";

  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[9rem_1fr] gap-x-2.5 py-0.5 max-narrow:grid-cols-1 max-narrow:gap-x-0"
>
  <span class="tracking-caps uppercase">{name}</span>
  <span class="min-w-0 break-words">
    {@render children()}
  </span>
</div>
