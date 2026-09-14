<script lang="ts">
  import type { Snippet } from "svelte";

  /** What a list says about itself before its first row: how it is read. */
  let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-wrap items-baseline justify-between gap-x-5 pt-5 pb-2">
  {@render children()}
</div>
