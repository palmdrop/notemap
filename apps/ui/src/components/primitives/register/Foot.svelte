<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="col-start-2 pt-6 max-narrow:col-span-full">
  {@render children()}
</div>
