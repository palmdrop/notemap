<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!--
  The left corner, because the right is where a composer lives. It stops short
  of the right one on a narrow screen: the palette control is down there, and a
  refusal is the one thing that must not be sat on.
-->
<div class="fixed right-20 bottom-4 left-4 z-10 grid max-w-84 gap-3 font-mono">
  {@render children()}
</div>
