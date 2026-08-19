<script lang="ts">
  import { saidBy, type Item, type RoutingRecord } from "@notemap/client";

  import Edit from "$components/item/Edit.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Value from "$components/primitives/register/Value.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { composing } from "$lib/composing.svelte";
  import { became, finished } from "$lib/lineage";
  import { wentTo } from "$lib/routing";
  import { briefly } from "$lib/stamp";

  let {
    item,
    opened,
    offline,
    onopen,
  }: {
    item: Item;
    opened: boolean;
    offline: boolean;
    onopen: () => void;
  } = $props();

  let editing = $state(false);
  let reserve = $state(0);
  let said = $state("");
  let records = $state<readonly RoutingRecord[]>([]);

  // Only ever for the one row that is open, so this is a request per triage
  // rather than one per row on the surface.
  $effect(() => {
    if (!opened || offline) return;

    void (async () => {
      try {
        records = await client.routing.recordsFor(item.id);
      } catch (error) {
        said = saidBy(error);
      }
    })();
  });

  const word = $derived(became(item));

  const destinations = client.destinations.all;

  const nameOf = $derived(
    (id: string) => $destinations.find((one) => one.id === id)?.name ?? id,
  );

  const routing = $derived(
    records
      .map((record) => `${wentTo(record, nameOf)} · ${record.state}`)
      .join(", "),
  );

  async function markDone() {
    said = "marking…";
    try {
      await client.routing.markProcessed(item.id);
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<Row {reserve}>
  <Stamp at={item.createdAt} {opened} {onopen}>
    {#if word !== undefined}
      <StateWord {word} />
    {/if}
  </Stamp>

  <Content>
    {#if editing}
      <Edit {item} ondone={() => (editing = false)} />
    {:else}
      <Payload {item} muted={finished(item)} />
    {/if}
  </Content>

  <Tags {item} />

  {#if opened}
    <Label name="edited" />
    <Value empty={item.contentUpdatedAt === undefined}>
      {item.contentUpdatedAt === undefined
        ? "not since capture"
        : briefly(item.contentUpdatedAt)}
    </Value>

    <Label name="routing" />
    <Value empty={routing === ""}>{routing === "" ? "none yet" : routing}</Value
    >

    <Label />
    <ActionRow>
      <!-- An archive, an edit and a tag replay from the outbox; a delivery
           cannot, so it is not offered rather than promised. -->
      <Action
        primary
        disabled={offline}
        onclick={() => composing.begin(item.id)}
      >
        route
      </Action>
      <Action disabled={offline} onclick={markDone}>mark done</Action>
      <Action onclick={() => void client.archive(item.id)}>archive</Action>
      <Action onclick={() => (editing = !editing)}>edit</Action>

      {#if said !== ""}
        <span role="status" class="text-ink-muted">{said}</span>
      {/if}
    </ActionRow>
  {/if}

  {#if composing.item === item.id}
    <RoutingComposer
      item={item.id}
      onclose={() => composing.end()}
      onreserve={(height) => (reserve = height)}
    />
  {/if}
</Row>
