<script lang="ts">
  import type { ItemState } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Block from "$components/record/Block.svelte";
  import { goto } from "$app/navigation";

  import { processHref, recordHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { commandsFor } from "$lib/command/item";
  import { publish } from "$lib/command/stack.svelte";
  import { became } from "$lib/lineage";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import {
    NO_ITEM_OFFLINE,
    NO_RECORDS_OFFLINE,
    NO_SUCH_ITEM,
    NO_SUCH_RECORD,
  } from "$lib/said";

  /**
   * The item as a register: the capture is the first row, then a rule, then
   * each routing record is a row of its own — its stamp and state in the rail,
   * the record as a block in the body. `only` narrows the records to one,
   * which is what the record's own address draws.
   */
  let { id, only }: { id: string; only?: string } = $props();

  const pool = reachable();
  const undrained = pending();

  let read = $state<ItemState | undefined>(undefined);
  let editing = $state(false);
  let tags = $state<Tags | undefined>(undefined);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so an archive made here marks it at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  // An item that was never routed has no records to read, unless one is
  // being asked for by name — then the pool is what says it is not there.
  const records = recordsOf(
    () =>
      item !== undefined && (only !== undefined || item.routing !== undefined)
        ? item.id
        : undefined,
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

  // One subject and no selection: the page is the item, so what it offers is
  // what its own `Actions` draws, built once and published as it stands. No
  // address — this surface is where `open` would lead.
  const commands = $derived(
    item === undefined
      ? []
      : commandsFor(item, {
          offline: !pool.yes,
          onprocess: () => void goto(processHref(id)),
          onedit: () => (editing = !editing),
          tag: () => tags?.add(),
        }),
  );

  publish(() => commands);

  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );

  const drawn = $derived(
    only === undefined
      ? records.all
      : records.all.filter((record) => record.id === only),
  );

  /** What the record rows say instead of records, where they have none to say. */
  const aboutRecords = $derived.by(() => {
    if (item?.routing === undefined && only === undefined) return undefined;
    if (records.refused !== "") return { said: records.refused, alarm: true };
    if (drawn.length > 0) return undefined;
    if (!pool.yes) return { said: NO_RECORDS_OFFLINE, alarm: false };
    if (only !== undefined && records.settled)
      return { said: NO_SUCH_RECORD, alarm: false, gone: true };
    if (!records.settled) return { said: "", alarm: false, asking: true };
    return undefined;
  });
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
        <Tags bind:this={tags} {item} addable />
      </div>
    </Rail>

    <Body>
      {#if editing}
        <Edit {item} ondone={() => (editing = false)} />
      {:else}
        <Payload {item} />
      {/if}

      <div class="mt-3.5">
        <Actions {commands} />
      </div>
    </Body>

    {#if drawn.length > 0 || aboutRecords !== undefined}
      <!-- The one rule between regions: the capture above, what became of it below. -->
      <div class="col-span-full border-t border-ink"></div>
    {/if}

    {#each drawn as record (record.id)}
      <Rail>
        <!-- The record's own address, where this is not already it. -->
        {#if only === undefined}
          <a href={recordHref(record.item, record.id)} class="block w-max">
            <Stamp at={record.at} />
          </a>
        {:else}
          <Stamp at={record.at} />
        {/if}
        <StateWord word={record.state} />
      </Rail>
      <Body>
        <Block {record} held={item} onundone={() => records.reread()} />
      </Body>
    {/each}

    {#if aboutRecords !== undefined}
      <Rail>
        {#if aboutRecords.gone === true}
          <StateWord word="gone" />
        {/if}
      </Rail>
      <Body>
        {#if aboutRecords.asking === true}
          <Asking />
        {:else if aboutRecords.alarm}
          <div role="status" class="text-alarm">{aboutRecords.said}</div>
        {:else if aboutRecords.gone === true}
          <Prose text={aboutRecords.said} />
        {:else}
          <div>{aboutRecords.said}</div>
        {/if}
      </Body>
    {/if}
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
  {:else}
    <Rail />
    <Body><Asking /></Body>
  {/if}
</Register>
