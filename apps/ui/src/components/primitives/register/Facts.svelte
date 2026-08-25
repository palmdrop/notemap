<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-4 grid gap-1">
  {@render children()}
</div>
