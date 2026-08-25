<script lang="ts">
  import type { Item } from "@notemap/client";

  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { became, finished } from "$lib/lineage";

  let {
    item,
    first = false,
    furled = false,
  }: { item: Item; first?: boolean; furled?: boolean } = $props();

  const word = $derived(became(item));
  const archived = $derived(item.archived !== undefined);
</script>

<Rail {first}>
  {#if !furled}
    <Stamp at={item.createdAt} />
  {/if}

  {#if word !== undefined}
    <StateWord {word} />
  {/if}

  <!-- Tagging replays from the outbox, so it survives on every row, finished or not. -->
  <Tags {item} />
  <Routing summary={item.routing} />
</Rail>

<Body {first}>
  {#if furled}
    <div class="mb-2 font-mono">
      <Stamp at={item.createdAt} />
    </div>
  {/if}

  <Payload {item} muted={finished(item)} />

  {#if archived}
    <ActionRow>
      <Action onclick={() => void client.unarchive(item.id)}>unarchive</Action>
    </ActionRow>
  {/if}
</Body>
