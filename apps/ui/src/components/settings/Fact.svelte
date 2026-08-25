<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    name,
    empty = false,
    children,
  }: { name: string; empty?: boolean; children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[7rem_1fr] gap-x-2.5 py-0.5 max-narrow:grid-cols-[1fr] max-narrow:gap-x-0"
>
  <span class="text-ink-muted">{name}</span>
  <span class="min-w-0 break-words {empty ? 'text-ink-muted' : ''}">
    {@render children()}
  </span>
</div>
