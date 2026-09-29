<script lang="ts">
  import type { ItemState } from "@notemap/client";

  import Row from "$components/item/Row.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Day from "$components/primitives/register/Day.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Block from "$components/record/Block.svelte";
  import { goto } from "$app/navigation";

  import { processHref, recordHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay, plain } from "$lib/days";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { rows as layout } from "$lib/rows.svelte";
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
  let row = $state<Row | undefined>(undefined);

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

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  // One subject and no selection: the page is the item, so what it offers is
  // what its own `Actions` draws, built once and published as it stands. No
  // address — this surface is where `open` would lead.
  const commands = $derived(
    item === undefined
      ? []
      : commandsFor(item, {
          offline: !pool.yes,
          onprocess: () => void goto(processHref(id)),
          onedit: () => row?.edit(),
          tag: () => row?.tag(),
        }),
  );

  publish(() =>
    row?.isEditing() === true ? whileEditing(commands) : commands,
  );

  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );

  const drawn = $derived(
    only === undefined
      ? records.all
      : records.all.filter((record) => record.id === only),
  );

  /** The records as drawn: under a heading per day, where the reader reads by day. */
  const headed = $derived.by(() => {
    const dated = drawn.map((record) => ({
      id: record.id,
      createdAt: record.at,
      record,
    }));
    return layout.byDay ? byDay(dated) : plain(dated);
  });

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

<Register slim={layout.slim}>
  {#if item !== undefined}
    {#if layout.byDay}
      <Day at={item.createdAt} />
    {/if}

    <!-- The capture as a selected row is drawn, box and foot, the page being
         the one item there is. An item view is where a person looks to find
         out what happened, so it says when it was drawn from the cache. -->
    <Row
      bind:this={row}
      {item}
      surface="item"
      selected
      offline={!pool.yes}
      {commands}
      pending={undrained.has(item.id)}
      layout={layout.drawn}
      opens={layout.byDay}
      cached={read?.fromCache === true}
    />

    {#if (drawn.length > 0 && !layout.byDay) || (drawn.length === 0 && aboutRecords !== undefined)}
      <!-- The one rule between regions: the capture above, what became of it
           below. By day, the records' own heading draws it. -->
      <div data-rule class="col-span-full border-t border-ink"></div>
    {/if}

    {#each headed as one (one.key)}
      {#if one.kind === "day"}
        <Day at={one.at} />
      {:else}
        {@const record = one.row.record}
        <Rail headed={layout.byDay}>
          <!-- The record's own address, where this is not already it. -->
          {#if only === undefined}
            <a href={recordHref(record.item, record.id)} class="block w-max">
              <Stamp at={record.at} dated={!layout.byDay} />
            </a>
          {:else}
            <Stamp at={record.at} dated={!layout.byDay} />
          {/if}
          {#if !layout.slim}
            <StateWord word={record.state} />
          {/if}
        </Rail>
        <Body>
          <Block {record} held={item} onundone={() => records.reread()} />
          {#if layout.slim}
            <StateWord word={record.state} />
          {/if}
        </Body>
      {/if}
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
