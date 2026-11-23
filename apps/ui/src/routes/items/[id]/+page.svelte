<script lang="ts">
  import Item from "$components/item/Item.svelte";
  import { lasting } from "$lib/lasting.svelte";

  let { data }: { data: { id: string } } = $props();

  const id = lasting(() => data.id);
</script>

<svelte:head>
  <title>Item | Notemap</title>
</svelte:head>

{#if id.current !== undefined}
  <Item id={id.current} />
{/if}
