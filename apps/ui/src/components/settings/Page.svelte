<script lang="ts">
  import type { Snippet } from "svelte";

  let { lede, children }: { lede: string; children: Snippet } = $props();
</script>

<div class="max-w-read pt-10">
  <p class="m-0">{lede}</p>
  {@render children()}
</div>
