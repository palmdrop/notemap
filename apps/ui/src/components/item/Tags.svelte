<script lang="ts">
  import type { Item } from "@notemap/client";

  import Label from "$components/primitives/register/Label.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";

  let { item }: { item: Item } = $props();

  const names = $derived((item.tags ?? []).map((tag) => tag.name));

  const inUse = client.tags.inUse;
  const offered = $derived($inUse.map((use) => use.name));
</script>

<Label name="tags" />
<TagSet
  {names}
  {offered}
  onadd={(name) => void client.tag(item.id, name)}
  onremove={(name) => void client.untag(item.id, name)}
/>
