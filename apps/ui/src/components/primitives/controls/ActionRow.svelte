<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-5 flex min-w-0 flex-wrap items-baseline gap-x-6 font-mono">
  {@render children()}
</div>
