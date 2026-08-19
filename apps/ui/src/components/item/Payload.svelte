<script lang="ts">
  import type { Item } from "@notemap/client";

  import Clamp from "$components/primitives/text/Clamp.svelte";
  import Figure from "$components/primitives/text/Figure.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";

  /** Muted where the item is finished, so live captures stand out while scrolling. */
  let { item, muted = false }: { item: Item; muted?: boolean } = $props();

  const images = $derived(client.images(item));
  const text = $derived(client.says(item));
</script>

{#each images as image (image)}
  <img src={image} alt="" loading="lazy" class="mb-2 block max-w-full" />
{/each}

{#if text !== ""}
  <Clamp>
    <Prose {text} {muted} />
  </Clamp>
{:else if images.length === 0}
  <!-- Nothing this shell knows how to draw, which is said by name rather than hidden. -->
  <Figure label={item.payload.type} />
{/if}
