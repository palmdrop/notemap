<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-7 flex items-baseline gap-x-gap">
  {@render children()}
</div>
