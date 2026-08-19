<script lang="ts">
  import type { Snippet } from "svelte";

  /** Whether a composer is open beside a row, which is what reserves the panel. */
  let { aside = false, children }: { aside?: boolean; children: Snippet } =
    $props();
</script>

<div
  class="grid {aside
    ? 'grid-cols-[1fr_var(--spacing-panel)] max-aside:grid-cols-[1fr]'
    : 'grid-cols-[1fr]'}"
>
  <div class="min-w-0 border-r border-ink pr-spine">
    {@render children()}
  </div>
</div>
