<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- Unlabelled, so on one column it takes the whole measure. -->
<div class="col-start-2 min-w-0 max-narrow:col-span-full">
  {@render children()}
</div>
