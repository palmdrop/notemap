<script lang="ts">
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { excerptOf } from "$lib/excerpt";
  import { log } from "$lib/log.svelte";

  /**
   * What to call a capture where all a surface has is its id: the capture's
   * own first words, which the log reads for the subjects the cache does not
   * hold. An id is what the pool says and nothing a person wrote, so it is
   * never drawn.
   */
  let { id, href }: { id: string; href?: string } = $props();

  const held = $derived(client.held(id));
  const item = $derived($held);
  const sought = $derived(log.sought(id));

  const said = $derived(
    item === undefined
      ? sought === "gone"
        ? "purged"
        : "a capture"
      : (excerptOf(client.says(item)) ?? item.payload.type),
  );
</script>

{#snippet words()}
  {#if item === undefined && sought === "asking"}
    <Asking />
  {:else}
    {said}
  {/if}
{/snippet}

{#if href === undefined}
  <span class="underline">{@render words()}</span>
{:else}
  <a {href} class="underline">{@render words()}</a>
{/if}
