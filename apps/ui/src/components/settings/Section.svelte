<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    name,
    aside,
    children,
  }: { name: string; aside?: string; children: Snippet } = $props();
</script>

<section class="mt-12">
  <h2
    class="m-0 flex items-baseline gap-6 border-b border-ink pb-2 font-normal"
  >
    <span class="tracking-caps uppercase">{name}</span>
    {#if aside !== undefined}
      <span class="ml-auto">{aside}</span>
    {/if}
  </h2>
  {@render children()}
</section>
