<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- The left corner, because the right is where a composer lives. -->
<div class="fixed bottom-4 left-4 z-10 grid max-w-84 gap-3 font-mono">
  {@render children()}
</div>
