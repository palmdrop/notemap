<script lang="ts">
  import type { Snippet } from "svelte";

  /** Nothing there, which is muted rather than absent. */
  let {
    name,
    empty = false,
    children,
  }: { name: string; empty?: boolean; children: Snippet } = $props();
</script>

<div
  class="grid grid-cols-[var(--spacing-fact)_1fr] gap-x-2.5 max-narrow:grid-cols-[1fr] max-narrow:gap-x-0"
>
  <span class="text-ink-muted">{name}</span>
  <span class="min-w-0 break-words {empty ? 'text-ink-muted' : ''}">
    {@render children()}
  </span>
</div>
