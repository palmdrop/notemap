<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    slim = false,
    children,
  }: {
    /** The rail holds a time and nothing more. */
    slim?: boolean;
    children: Snippet;
  } = $props();
</script>

<!-- Two columns and one vertical rule between them, drawn by the rail; no rule
     between rows. Each item drops its cells into this, so the columns stay in
     register down the whole page. -->
<div
  class="grid {slim
    ? 'grid-cols-[var(--spacing-rail-time)_1fr]'
    : 'grid-cols-[var(--spacing-rail)_1fr] max-narrow:grid-cols-[var(--spacing-rail-narrow)_1fr]'}"
>
  {@render children()}
</div>
