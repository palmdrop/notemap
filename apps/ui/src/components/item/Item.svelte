<script lang="ts">
  import { quick } from "$lib/quicking.svelte";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { ItemState, RoutingRecord } from "@notemap/client";

  import ItemBar from "$components/item/ItemBar.svelte";
  import { width } from "$lib/breakpoint";
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

  import { recordHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay } from "$lib/days";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { NO_ITEM_OFFLINE, NO_RECORDS_OFFLINE, NO_SUCH_ITEM } from "$lib/said";

  /**
   * The item as a register: the capture is the first row, then a rule, then
   * each routing record is a row of its own — its stamp and state in the rail,
   * the record as a block in the body.
   */
  let { id }: { id: string } = $props();

  const pool = reachable();
  const undrained = pending();

  let read = $state<ItemState | undefined>(undefined);
  let row = $state<Row | undefined>(undefined);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so an archive made here marks it at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  /**
   * Records this view has drawn standing. A withdrawn record is drawn only if
   * it is one of them — withdrawn while the person was here, where reinstating
   * is still offered — and read again later it is left out.
   */
  const standing = new SvelteSet<string>();

  // An item that was never routed has no records to read, unless one this
  // view drew has been withdrawn since.
  const records = recordsOf(
    () =>
      item !== undefined &&
      (item.routing !== undefined || untrack(() => standing.size > 0))
        ? item.id
        : undefined,
    () => pool.yes,
  );

  $effect(() => {
    for (const record of records.all) {
      if (record.withdrawnAt === undefined) standing.add(record.id);
    }
  });

  $effect(() => {
    const wanted = id;
    read = undefined;
    untrack(() => standing.clear());

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  // One subject and no selection: the page is the item, so what it offers is
  // what its own bar draws, built once and published as it stands. No
  // address — this surface is where `open` would lead.
  const commands = $derived(
    item === undefined
      ? []
      : commandsFor(item, {
          revises: true,
          offline: !pool.yes,
          onprocess: () => quick.open(id),
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
    records.all.filter(
      (record) => record.withdrawnAt === undefined || standing.has(record.id),
    ),
  );

  /** The records as drawn: under a heading per day, where the reader reads by day. */
  const headed = $derived.by(() => {
    const dated = drawn.map((record) => ({
      id: record.id,
      createdAt: record.at,
      record,
    }));
    return byDay(dated);
  });

  const stateOf = (record: RoutingRecord): string =>
    record.withdrawnAt === undefined ? record.state : "withdrawn";

  /** What the record rows say instead of records, where they have none to say. */
  const aboutRecords = $derived.by(() => {
    if (item?.routing === undefined) return undefined;
    if (records.refused !== "") return { said: records.refused, alarm: true };
    if (drawn.length > 0) return undefined;
    if (!pool.yes) return { said: NO_RECORDS_OFFLINE, alarm: false };
    if (!records.settled) return { said: "", alarm: false, asking: true };
    return undefined;
  });
</script>

{#if item !== undefined && width.wide}
  <div class="-mx-8">
    <ItemBar {item} {commands} editing={row?.editor()} />
  </div>
{/if}

<Register>
  {#if item !== undefined}
    <!-- The capture as a selected row is drawn, box and foot, the page being
         the one item there is. An item view is where a person looks to find
         out what happened, so it says when it was drawn from the cache. -->
    <Row
      bind:this={row}
      {item}
      surface="item"
      selected
      offline={!pool.yes}
      pending={undrained.has(item.id)}
      foot={false}
      opens
      cached={read?.fromCache === true}
    />

    {#each headed as one (one.key)}
      {#if one.kind === "day"}
        <Day at={one.at} />
      {:else}
        {@const record = one.row.record}
        <Rail>
          <!-- The record's own address. -->
          <a href={recordHref(record.item, record.id)} class="block w-max">
            <Stamp at={record.at} dated={false} />
          </a>
        </Rail>
        <Body>
          <Block
            {record}
            held={item}
            folds
            editing={row?.isEditing() === true}
            onundone={() => records.reread()}
          />
          <StateWord word={stateOf(record)} />
        </Body>
      {/if}
    {/each}

    {#if aboutRecords !== undefined}
      <Rail />
      <Body>
        {#if aboutRecords.asking === true}
          <Asking />
        {:else if aboutRecords.alarm}
          <div role="status" class="text-danger">{aboutRecords.said}</div>
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
        <div role="status" class="text-danger">{refused}</div>
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

{#if item !== undefined && !width.wide}
  <div aria-hidden="true" class="h-28"></div>
  <div class="fixed inset-x-0 bottom-0 z-20">
    <ItemBar {item} {commands} editing={row?.editor()} />
  </div>
{/if}
