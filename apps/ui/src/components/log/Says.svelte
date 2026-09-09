<script lang="ts">
  import { shortened } from "$lib/actions";
  import { client } from "$lib/client";
  import { excerptOf } from "$lib/excerpt";

  /**
   * What to call a capture where all a surface has is its id. The capture's own
   * first words where this shell already holds them, and the shortened id where
   * it does not — an id being what the pool says and nothing a person wrote.
   *
   * Nothing is read for it: the cache is asked and answered from, so a log of a
   * hundred rows is a hundred lookups and no requests.
   */
  let { id, href }: { id: string; href?: string } = $props();

  const held = $derived(client.held(id));
  const item = $derived($held);

  const said = $derived(
    item === undefined
      ? shortened(id)
      : (excerptOf(client.says(item)) ?? shortened(id)),
  );
</script>

{#if href === undefined}
  <span class="border-b border-ink/35">{said}</span>
{:else}
  <a {href} class="border-b border-ink/35">{said}</a>
{/if}
