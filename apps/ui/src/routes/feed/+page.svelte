<script lang="ts">
  import Item from "$components/item/Item.svelte";
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();

  $effect(() => {
    console.log("feed", data.feed);
  });
</script>

<h1>Feed</h1>

{#each data.feed as item}
  <Item item={item} />
{/each}