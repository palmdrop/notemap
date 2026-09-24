<script lang="ts">
  import type { Item } from "@notemap/client";

  import Clamp from "$components/primitives/text/Clamp.svelte";
  import Figure from "$components/primitives/text/Figure.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Unfurls from "$components/unfurl/Unfurls.svelte";
  import { client } from "$lib/client";

  let { item }: { item: Item } = $props();

  const images = $derived(client.images(item));
  const text = $derived(client.says(item));
</script>

{#each images as image (image)}
  <!-- Bounded in both directions: a tall photograph would otherwise swallow the list. -->
  <img
    src={image}
    alt=""
    loading="lazy"
    class="mb-2 block max-h-96 max-w-full object-contain object-left"
  />
{/each}

{#if text !== ""}
  <Clamp>
    <Prose {text} />
  </Clamp>
  <Unfurls {text} />
{:else if images.length === 0}
  <!-- Nothing this shell knows how to draw, which is said by name rather than hidden. -->
  <Figure label={item.payload.type} />
{/if}
