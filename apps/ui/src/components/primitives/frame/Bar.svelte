<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="flex items-baseline gap-6 border-b border-ink pb-3 font-mono text-mono"
>
  <a
    href="/"
    class="font-prose lowercase tracking-widest [font-variant-caps:small-caps]"
  >
    notemap
  </a>
  {@render children()}
</div>
