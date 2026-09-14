<script lang="ts">
  import type { ItemState } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
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
  import { goto } from "$app/navigation";

  import { processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { became } from "$lib/lineage";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { NO_ITEM_OFFLINE, NO_RECORDS_OFFLINE, NO_SUCH_ITEM } from "$lib/said";
  import { briefly } from "$lib/stamp";

  let { id }: { id: string } = $props();

  const pool = reachable();
  const undrained = pending();

  let read = $state<ItemState | undefined>(undefined);
  let editing = $state(false);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so an archive made here marks it at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  const records = recordsOf(
    () => (item?.routing === undefined ? undefined : item.id),
    () => pool.yes,
  );

  $effect(() => {
    const wanted = id;
    read = undefined;
    editing = false;

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  const word = $derived(item === undefined ? undefined : became(item));
  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );
</script>

<Register>
  {#if item !== undefined}
    <Rail>
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

      <div class="mt-0.5">
        <Tags {item} addable />
      </div>
      <Routing
        summary={item.routing}
        records={records.all}
        onundone={() => records.reread()}
      />

      <!-- The item may be the client's own and the records never are, so the
           one surface answers for the two of them separately. -->
      {#if item.routing !== undefined && records.all.length === 0 && !pool.yes}
        <div class="mt-2">{NO_RECORDS_OFFLINE}</div>
      {/if}

      {#if records.refused !== ""}
        <div role="status" class="mt-2 text-alarm">{records.refused}</div>
      {/if}

      <!-- What it is, the capture says; what a fact answers is what it cannot. -->
      {#if item.contentUpdatedAt !== undefined}
        <Facts>
          <Fact name="edited">{briefly(item.contentUpdatedAt)}</Fact>
        </Facts>
      {/if}
    </Rail>

    <Body>
      {#if editing}
        <Edit {item} ondone={() => (editing = false)} />
      {:else}
        <Payload {item} />
      {/if}

      <div class="mt-3.5">
        <Actions
          {item}
          offline={!pool.yes}
          onprocess={() => void goto(processHref(id))}
          onedit={() => (editing = !editing)}
        />
      </div>
    </Body>
  {:else if read !== undefined}
    <Rail>
      {#if refused === undefined && read.failure === undefined}
        <StateWord word="gone" />
      {/if}
    </Rail>
    <Body>
      {#if refused !== undefined}
        <div role="status" class="text-alarm">{refused}</div>
      {:else if read.failure !== undefined}
        <div>{NO_ITEM_OFFLINE}</div>
      {:else}
        <Prose text={NO_SUCH_ITEM} />
      {/if}
    </Body>
  {/if}
</Register>
