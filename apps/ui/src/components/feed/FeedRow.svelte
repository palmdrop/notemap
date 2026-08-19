<script lang="ts">
  import type { Item } from "@notemap/client";

  import Payload from "$components/item/Payload.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";

  let { item }: { item: Item } = $props();
</script>

<Row>
  <Stamp at={item.createdAt} />
  <Content>
    <Payload {item} />
  </Content>
  <Tags {item} />
</Row>
