<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div
  class="col-start-2 pt-6 pl-gutter max-narrow:col-span-full max-narrow:pl-0"
>
  {@render children()}
</div>
