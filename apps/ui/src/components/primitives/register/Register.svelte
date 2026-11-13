<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- Two columns, the time and the words, each row ruled under; every item
     drops its cells into this, so the columns stay in register down the page. -->
<div
  class="-mx-3.5 grid grid-cols-[calc(var(--spacing-time)+var(--spacing-gutter))_minmax(0,1fr)] wide:-mx-8"
>
  {@render children()}
</div>
