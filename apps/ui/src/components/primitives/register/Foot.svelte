<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="col-span-full px-gutter pt-4 pb-6">
  {@render children()}
</div>
