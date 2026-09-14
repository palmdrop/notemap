<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="max-w-read pt-4">
  {@render children()}
</div>
