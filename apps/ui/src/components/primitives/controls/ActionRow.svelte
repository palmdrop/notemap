<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-gap font-mono max-narrow:col-span-full"
>
  {@render children()}
</div>
