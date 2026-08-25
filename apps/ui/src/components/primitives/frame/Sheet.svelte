<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- The deep foot leaves the last row reachable above a corner refusal. -->
<div class="min-h-screen px-4 pt-6 pb-32 max-narrow:px-3">
  {@render children()}
</div>
