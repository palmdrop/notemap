<script lang="ts">
  import type { Snippet } from "svelte";

  /** `aside` is the fact about the whole section, at the far end of its head. */
  let {
    name,
    aside,
    children,
  }: { name: string; aside?: string; children: Snippet } = $props();
</script>

<section class="mt-12">
  <h2
    class="m-0 flex items-baseline gap-6 border-b border-ink pb-2 text-mono font-normal"
  >
    <span class="tracking-[0.3em] text-ink-muted uppercase">{name}</span>
    {#if aside !== undefined}
      <span class="ml-auto tracking-normal text-ink-muted">{aside}</span>
    {/if}
  </h2>
  {@render children()}
</section>
