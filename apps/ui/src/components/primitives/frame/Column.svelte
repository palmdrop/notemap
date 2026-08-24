<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto max-w-[var(--spacing-measure)]">
  {@render children()}
</div>
