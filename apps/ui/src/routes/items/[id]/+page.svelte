<script lang="ts">
  import Item from "$components/item/Item.svelte";

  let { data }: { data: { id: string } } = $props();
</script>

<svelte:head>
  <title>Item | Notemap</title>
</svelte:head>

<Item id={data.id} />
