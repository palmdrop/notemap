<script lang="ts">
  import type { Item } from "@notemap/client";

  import Payload from "$components/item/Payload.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { became, finished } from "$lib/lineage";

  let { item }: { item: Item } = $props();

  const word = $derived(became(item));
  const archived = $derived(item.archived !== undefined);
</script>

<Row>
  <Stamp at={item.createdAt}>
    {#if word !== undefined}
      <StateWord {word} />
    {/if}
  </Stamp>

  <Content>
    <Payload {item} muted={finished(item)} />
  </Content>

  <!-- Tagging replays from the outbox, so it survives on every row, finished or not. -->
  <Tags {item} />

  {#if archived}
    <Label />
    <ActionRow>
      <Action onclick={() => void client.unarchive(item.id)}>unarchive</Action>
    </ActionRow>
  {/if}
</Row>
