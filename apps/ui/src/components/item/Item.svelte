<script lang="ts">
  import { saidBy, type ItemState, type RoutingRecord } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { became } from "$lib/lineage";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { NO_ITEM_OFFLINE, NO_SUCH_ITEM } from "$lib/said";
  import { briefly } from "$lib/stamp";

  let { id }: { id: string } = $props();

  const pool = reachable();
  const undrained = pending();

  let read = $state<ItemState | undefined>(undefined);
  let editing = $state(false);
  let routing = $state(false);
  let said = $state("");
  let records = $state<readonly RoutingRecord[]>([]);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so an archive made here marks it at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  $effect(() => {
    const wanted = id;
    read = undefined;
    editing = false;

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  $effect(() => {
    if (item === undefined || pool.yes === false || item.routing === undefined)
      return;

    void (async () => {
      try {
        records = await client.routing.recordsFor(item.id);
      } catch (error) {
        said = saidBy(error);
      }
    })();
  });

  const word = $derived(item === undefined ? undefined : became(item));
  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );
</script>

<Register>
  {#if item !== undefined}
    <Rail first>
      <Stamp at={item.createdAt} />

      {#if word !== undefined}
        <StateWord {word} />
      {/if}

      {#if undrained.has(item.id)}
        <Pending />
      {/if}

      <!-- An item view is where a person looks to find out what happened, so
           it is the worst place to imply the pool has answered for it. -->
      {#if read?.fromCache === true}
        <Cached />
      {/if}

      <Tags {item} />
      <Routing summary={item.routing} {records} />

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
    </Rail>

    <Body first>
      {#if editing}
        <Edit {item} ondone={() => (editing = false)} />
      {:else}
        <Payload {item} />
      {/if}

      <Actions
        {item}
        offline={!pool.yes}
        {said}
        onroute={() => (routing = true)}
        onedit={() => (editing = !editing)}
      />
    </Body>
  {:else if read !== undefined}
    <Rail first>
      {#if refused === undefined && read.failure === undefined}
        <StateWord word="gone" />
      {:else}
        item
      {/if}
    </Rail>
    <Body first>
      {#if refused !== undefined}
        <div role="status" class="font-mono text-accent">{refused}</div>
      {:else if read.failure !== undefined}
        <div class="font-mono text-ink-muted">{NO_ITEM_OFFLINE}</div>
      {:else}
        <Prose text={NO_SUCH_ITEM} />
      {/if}
    </Body>
  {/if}
</Register>

{#if routing && item !== undefined}
  <RoutingComposer
    item={item.id}
    subject={client.says(item) || item.payload.type}
    content={item.payload.content}
    tags={(item.tags ?? []).map((tag) => tag.name)}
    onclose={() => (routing = false)}
  />
{/if}
