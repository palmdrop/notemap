<script lang="ts">
  import Item from "$components/item/Item.svelte";

  let { data }: { data: { id: string } } = $props();
</script>

<Item id={data.id} />
