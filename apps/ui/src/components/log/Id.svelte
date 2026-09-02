<script lang="ts">
  import { shortened } from "$lib/actions";

  /** Linked ids go to the log narrowed to that subject; the rest only read. */
  let { id, link = false }: { id: string; link?: boolean } = $props();

  const href = $derived(`/log?item=${encodeURIComponent(id)}`);
</script>

{#if link}
  <a {href} class="border-b border-ink/35 text-ink">{shortened(id)}</a>
{:else}
  <span class="border-b border-ink/35 text-ink">{shortened(id)}</span>
{/if}
