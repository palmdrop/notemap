<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    name,
    empty = false,
    children,
  }: { name: string; empty?: boolean; children: Snippet } = $props();
</script>

<div class="contents max-narrow:grid max-narrow:grid-cols-[1fr]">
  <span class="min-w-0 break-words text-ink-muted">{name}</span>
  <span class="min-w-0 break-words {empty ? 'text-ink-muted' : ''}">
    {@render children()}
  </span>
</div>
