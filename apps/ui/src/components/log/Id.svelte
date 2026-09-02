<script lang="ts">
  import { shortened } from "$lib/actions";

  /** A linked id goes to the log narrowed to that subject; the rest only read. */
  let { id, href }: { id: string; href?: string } = $props();
</script>

{#if href === undefined}
  <span class="border-b border-ink/35">{shortened(id)}</span>
{:else}
  <a {href} class="border-b border-ink/35">{shortened(id)}</a>
{/if}
