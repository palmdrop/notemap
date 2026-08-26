<script lang="ts">
  import { saidBy, type Item, type RoutingRecord } from "@notemap/client";

  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { became, editable, finished } from "$lib/lineage";
  import { briefly } from "$lib/stamp";

  let {
    item,
    opened,
    offline,
    furled,
    pending = false,
    onopen,
    onroute,
  }: {
    item: Item;
    opened: boolean;
    offline: boolean;
    furled: boolean;
    pending?: boolean;
    onopen: () => void;
    onroute: () => void;
  } = $props();

  let editing = $state(false);
  let said = $state("");
  let records = $state<readonly RoutingRecord[]>([]);

  // Only ever for the one row that is open, and only where the item's summary
  // says there is something to read: a request per triage at the very most.
  $effect(() => {
    if (!opened || offline || item.routing === undefined) return;

    void (async () => {
      try {
        records = await client.routing.recordsFor(item.id);
      } catch (error) {
        said = saidBy(error);
      }
    })();
  });

  const word = $derived(became(item));
  const mayEdit = $derived(editable(item));

  async function markDone() {
    said = "marking…";
    try {
      await client.routing.markProcessed(item.id);
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<Rail lit={opened} onpick={onopen}>
  {#if !furled}
    <Stamp at={item.createdAt} {opened} onopen={() => onopen()} />
  {/if}

  {#if !furled && word !== undefined}
    <StateWord {word} />
  {/if}

  {#if !furled && pending}
    <Pending />
  {/if}

  <Tags {item} />
  <Routing summary={item.routing} records={opened ? records : []} />

  {#if opened}
    <Facts>
      <Fact name="payload">{item.payload.type}</Fact>
      <Fact name="edited" empty={item.contentUpdatedAt === undefined}>
        {item.contentUpdatedAt === undefined
          ? "not since capture"
          : briefly(item.contentUpdatedAt)}
      </Fact>
      <Fact name="source">{item.source}</Fact>
      <Fact name="id">{item.id}</Fact>
    </Facts>
  {/if}
</Rail>

<Body lit={opened} onpick={onopen}>
  {#if furled}
    <div class="mb-2 flex flex-wrap items-baseline gap-3 font-mono">
      <Stamp at={item.createdAt} {opened} onopen={() => onopen()} />

      {#if word !== undefined}
        <StateWord {word} inline />
      {/if}

      {#if pending}
        <Pending inline />
      {/if}
    </div>
  {/if}

  {#if editing && mayEdit}
    <Edit {item} ondone={() => (editing = false)} />
  {:else}
    <Payload {item} muted={finished(item)} />
  {/if}

  {#if opened}
    <ActionRow>
      <!-- An archive, an edit and a tag replay from the outbox; a delivery
           cannot, so it is not offered rather than promised. -->
      <Action primary disabled={offline} onclick={onroute}>route</Action>
      <Action disabled={offline} onclick={markDone}>mark done</Action>
      <Action onclick={() => void client.archive(item.id)}>archive</Action>
      <!-- A processed item is not this row's to rewrite: editing it would
           append a revision, which the queue is not where to do. -->
      {#if mayEdit}
        <Action onclick={() => (editing = !editing)}>edit</Action>
      {/if}

      {#if said !== ""}
        <span role="status" class="text-ink-muted">{said}</span>
      {/if}
    </ActionRow>
  {/if}
</Body>
