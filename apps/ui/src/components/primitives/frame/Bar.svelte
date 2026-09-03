<script lang="ts">
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-ink pb-3 font-mono text-mono max-narrow:gap-x-4"
>
  <a
    href={resolve("/")}
    class="font-prose tracking-widest lowercase [font-variant-caps:small-caps]"
  >
    notemap
  </a>
  {@render children()}
</div>
