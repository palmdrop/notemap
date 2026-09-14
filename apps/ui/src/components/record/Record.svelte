<script lang="ts">
  import Item from "$components/item/Item.svelte";

  /** A record's own address: the item's register, narrowed to the one record. */
  let { item, record }: { item: string; record: string } = $props();
</script>

<Item id={item} only={record} />
