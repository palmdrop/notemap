<script lang="ts">
  import { onMount, tick, untrack } from "svelte";

  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import type { Item } from "@notemap/client";

  import Capture from "$components/capture/Capture.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import Index from "$components/queue/Index.svelte";
  import Row from "$components/item/Row.svelte";
  import Order from "$components/order/Order.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { commandsFor } from "$lib/command/item";
  import { listCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { orderFor } from "$lib/order";
  import { readPast } from "$lib/paging";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { refusalIn } from "$lib/refusal";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "queue";

  /** On the queue's address, once, on the way back from processing. */
  const SELECTED = "selected";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();

  /** Processing starts on the row, and one row is selected at a time. */
  let selected = $state<string | undefined>(undefined);

  /** Where the selected row last stood, for when it leaves. */
  let stood = $state<number | undefined>(undefined);

  /** Back from processing with a row still selected: the keys are its, not the field's. */
  const arrived = page.url.searchParams.get(SELECTED);

  let view = $state<View>(viewFor(SURFACE, page.url));

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});
  let index = $state<Index | undefined>(undefined);

  const refused = $derived(refusalIn($queue));

  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      $queue.items.length === 0,
  );

  /** The selected row's own copy, which outlives its place on the queue. */
  const heldRow = $derived(client.held(selected ?? ""));

  /**
   * A decision takes the selected row off the queue, and the row stays drawn
   * where it stood until the selection leaves it: the decision can be looked
   * at, and taken back from the row, after it is made.
   */
  const rows = $derived.by(() => {
    const live = $queue.items;
    const kept = $heldRow;
    if (
      selected === undefined ||
      kept === undefined ||
      live.some((row) => row.id === selected)
    ) {
      return live;
    }
    const place = Math.min(untrack(() => stood) ?? live.length, live.length);
    return [...live.slice(0, place), kept, ...live.slice(place)];
  });

  // A selected row the client no longer holds at all is gone for good. The
  // selection moves to the row that took its place rather than leaving
  // nothing selected and the next `j` at the top.
  $effect(() => {
    const at = rows.findIndex((row) => row.id === selected);
    if (at !== -1) {
      stood = at;
      return;
    }
    if (selected === undefined || rows.length === 0) return;
    const place = untrack(() => stood);
    if (place === undefined) return;
    selected = rows[Math.min(place, rows.length - 1)]?.id;
  });

  onMount(() => {
    // Read once: the address is put back so a reload does not reselect it.
    if (arrived !== null) {
      selected = arrived;
      const plain = new URL(page.url);
      plain.searchParams.delete(SELECTED);
      replaceState(plain, {});
    }

    void (async () => {
      await client.enter(SURFACE, orderFor(SURFACE, page.url));
      await tick();
      if (arrived === null) restorePlace(SURFACE);
      else reveal(arrived);
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload, and on the way back from
    // reading one of these items.
    return keepPlace(SURFACE);
  });

  function select(id: string) {
    if (selected === id) deselect();
    else selected = id;
  }

  function deselect() {
    selected = undefined;
    stood = undefined;
  }

  /** The deep tier: a surface of its own, which comes back here when it is done. */
  function process(item: Item) {
    void goto(processHref(item.id));
  }

  function read(wanted: View) {
    view = wanted;
    remember(SURFACE, wanted);
    replaceState(withView(page.url, wanted), {});
  }

  const current = $derived(rows.find((row) => row.id === selected));

  function reveal(id: string) {
    drawn[id]?.reveal();
    index?.reveal(id);
  }

  /**
   * Moves the selection one row along, and brings it into view. Past the last
   * row held it reads the next page first.
   */
  async function walk(step: 1 | -1) {
    if (rows.length === 0) return;
    const from = selected;
    const last = () => rows.at(-1)?.id === from;
    if (step === 1 && from !== undefined && last() && pool.yes) {
      await readPast(
        queue,
        () => client.loadQueue(),
        () => selected === from && last(),
      );
      // Somebody moved on, or let go, while the page was read.
      if (selected !== from) return;
    }
    const at = rows.findIndex((row) => row.id === selected);
    const next =
      at === -1
        ? step === 1
          ? 0
          : rows.length - 1
        : Math.min(Math.max(at + step, 0), rows.length - 1);
    const row = rows[next];
    if (row === undefined) return;
    selected = row.id;
    void tick().then(() => reveal(row.id));
  }

  // Built once and read twice: the row draws these as buttons and a chord
  // takes the same objects, so the two cannot come to mean different things.
  const commands = $derived(
    current === undefined
      ? []
      : commandsFor(current, {
          address: itemHref(current.id),
          offline: !pool.yes,
          onprocess: () => process(current),
          onedit: () => drawn[current.id]?.edit(),
          tag: () => drawn[current.id]?.tag(),
        }),
  );

  publish(() => [
    ...listCommands({
      ondown: () => void walk(1),
      onup: () => void walk(-1),
      onselect: () => (current !== undefined ? process(current) : void walk(1)),
      ondeselect: deselect,
    }),
    ...commands,
  ]);
</script>

<Capture focus={arrived === null} />

<Head>
  <ViewToggle {view} onchoose={read} />
  <Order />
</Head>

{#if drained}
  <Drained />
{:else if view === "index"}
  {#if refused !== undefined}
    <Register><Refused surface="queue" {refused} /></Register>
  {/if}

  <Index
    bind:this={index}
    items={rows}
    {selected}
    onselect={select}
    onprocess={(id) => {
      const item = rows.find((row) => row.id === id);
      if (item !== undefined) process(item);
    }}
  />

  {#if $queue.more}
    <More
      loading={$queue.loading}
      first={rows.length === 0}
      offline={!pool.yes}
      failed={$queue.failure !== undefined}
      onmore={() => void client.loadQueue()}
    />
  {/if}
{:else}
  <Register>
    {#if refused !== undefined}
      <Refused surface="queue" {refused} />
    {/if}

    {#each rows as row (row.id)}
      <Row
        bind:this={drawn[row.id]}
        item={row}
        surface="queue"
        selected={selected === row.id}
        offline={!pool.yes}
        commands={selected === row.id ? commands : []}
        pending={undrained.has(row.id)}
        onselect={() => select(row.id)}
        onprocess={() => process(row)}
      />
    {/each}

    {#if $queue.more}
      <More
        loading={$queue.loading}
        first={rows.length === 0}
        offline={!pool.yes}
        failed={$queue.failure !== undefined}
        onmore={() => void client.loadQueue()}
      />
    {/if}
  </Register>
{/if}
