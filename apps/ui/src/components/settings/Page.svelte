<script lang="ts">
  import type { Snippet } from "svelte";

  let { lede, children }: { lede: string; children: Snippet } = $props();
</script>

<div class="max-w-[var(--spacing-read)] pt-10 font-mono">
  <p class="m-0 text-ink-muted">{lede}</p>
  {@render children()}
</div>
