<script lang="ts">
  import type { Snippet } from "svelte";

  /** What an open row adds to its rail, none of it worth reading while scanning. */
  let { children }: { children: Snippet } = $props();
</script>

<div class="mt-4 grid gap-1">
  {@render children()}
</div>
