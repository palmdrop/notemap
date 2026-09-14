<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto max-w-measure">
  {@render children()}
</div>
