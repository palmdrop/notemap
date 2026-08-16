<script lang="ts">
  import { imagesIn, type Item } from "$lib/api";

  let { item }: { item: Item } = $props();

  const images = $derived(imagesIn(item));
  const said = $derived(
    (item.payload.content.text ?? item.payload.content.caption ?? "") as string,
  );
</script>

<li class="bg-white p-3 dark:bg-neutral-900">
  {#each images as image (image)}
    <img
      src={image}
      alt=""
      loading="lazy"
      class="mb-2 block max-w-full rounded-sm"
    />
  {/each}

  {#if said !== ""}
    <p class="m-0 break-words whitespace-pre-wrap">{said}</p>
  {/if}

  <time
    datetime={item.createdAt}
    class="mt-1.5 block text-xs text-neutral-500 dark:text-neutral-400"
  >
    {new Date(item.createdAt).toLocaleString()}
  </time>
</li>
