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
  import Day from "$components/primitives/register/Day.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import TagFilter from "$components/tags/TagFilter.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import type { Command } from "$lib/command/command";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { listCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay, plain } from "$lib/days";
  import { filtering } from "$lib/filtering.svelte";
  import { placeOf } from "$lib/held";
  import { leave } from "$lib/leaving.svelte";
  import { moving } from "$lib/moving.svelte";
  import { readPast } from "$lib/paging";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { rows as layout } from "$lib/rows.svelte";
  import { restorePlace } from "$lib/scroll-mark";
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

  /** The capture box is selected rather than a row: it is the head of the queue. */
  let atCapture = $state(false);
  let capture = $state<Capture | undefined>(undefined);

  /** Where the selected row last stood, for when it leaves. */
  let stood = $state<number | undefined>(undefined);

  /** Back from processing with a row still selected: the keys are its, not the field's. */
  const arrived = page.url.searchParams.get(SELECTED);

  /** Going back and forward moves through the views a filter was taken from. */
  let view = $derived<View>(viewFor(SURFACE, page.url));

  const reading = filtering(
    SURFACE,
    () => ({ view, order: $queue.order }),
    () => deselect(),
  );

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});
  let index = $state<Index | undefined>(undefined);
  let tagFilter = $state<TagFilter | undefined>(undefined);

  const refused = $derived(refusalIn($queue));

  /**
   * Whether there is more is what the pool's first page answers, so rows drawn
   * from the cache while it is read are offered nothing past them.
   */
  const footed = $derived(
    $queue.more &&
      !($queue.fromCache && $queue.loading && $queue.items.length > 0),
  );

  const motion = moving(
    () => $queue.loading,
    () => $queue.items.length,
    () => !$queue.loading && !$queue.fromCache && $queue.failure === undefined,
  );

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
    const place = Math.min(
      untrack(() => stood) ?? placeOf(live, kept, $queue.order),
      live.length,
    );
    return [...live.slice(0, place), kept, ...live.slice(place)];
  });

  // A selected row the client no longer holds at all is gone for good. The
  // selection moves to the row that took its place rather than leaving
  // nothing selected and the next `j` at the top.
  $effect(() => {
    const at = rows.findIndex((row) => row.id === selected);
    if (at !== -1) {
      // Only the queue's own place for it: one this surface chose for a held
      // row would outlive a read that has not landed yet.
      if ($queue.items.some((row) => row.id === selected)) stood = at;
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

    // Scrolling past an item is a skip, and a skip changes nothing: the place
    // kept is only where to put the view back on reload, and on the way back
    // from reading one of these items.
    void (async () => {
      await reading.arrive();
      if (arrived === null) restorePlace(reading.place);
      else reveal(arrived);
    })();
  });

  function select(id: string) {
    leave(() => {
      if (selected === id) deselect();
      else selected = id;
    });
  }

  function deselect() {
    selected = undefined;
    stood = undefined;
    atCapture = false;
  }

  // A row taken by any way at all — a click, a key, the way back from
  // processing — is the one selection there is.
  $effect(() => {
    if (selected !== undefined) atCapture = false;
  });

  /** Writing in the box is being at the head of the queue, and no row is selected meanwhile. */
  function captureFocused() {
    // Asked first, the question took the focus, and the box is given it back.
    let asked = false;
    leave(() => {
      deselect();
      atCapture = true;
      if (asked) capture?.take();
    });
    asked = true;
  }

  function toCapture() {
    deselect();
    atCapture = true;
    capture?.take();
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

  /** The rows as drawn: under a heading per day, where the reader reads by day. */
  const headed = $derived(layout.byDay ? byDay(rows) : plain(rows));

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
    if (
      step === -1 &&
      (atCapture || (from !== undefined && rows[0]?.id === from))
    ) {
      toCapture();
      return;
    }
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

  /** What a key reaches on the selected row: its tags alone while it is being edited. */
  function reached(): readonly Command[] {
    return current !== undefined && drawn[current.id]?.isEditing() === true
      ? whileEditing(commands)
      : commands;
  }

  publish(() => [
    ...listCommands({
      ondown: () => leave(() => void walk(1)),
      onup: () => leave(() => void walk(-1)),
      onselect: () => {
        if (current !== undefined) {
          if (drawn[current.id]?.isEditing() !== true) process(current);
        } else if (atCapture) capture?.take();
        else void walk(1);
      },
      ondeselect: () => leave(deselect),
    }),
    ...reached(),
    ...(atCapture
      ? [
          { id: "tag", label: "tag", run: () => capture?.tag() },
          { id: "edit", label: "write", run: () => capture?.take() },
          { id: "capture", label: "capture", run: () => capture?.commit() },
        ]
      : []),
    { id: "filter", label: "filter", run: () => void tagFilter?.show() },
  ]);
</script>

<Capture
  bind:this={capture}
  focus={arrived === null}
  selected={atCapture}
  onfocus={captureFocused}
/>

<Head>
  <ViewToggle {view} onchoose={read} />
  <span class="flex items-baseline gap-5">
    <TagFilter
      bind:this={tagFilter}
      surface={SURFACE}
      filter={reading.filter}
      ontoggle={reading.toggle}
      onclear={reading.clear}
    />
    <Order />
  </span>
</Head>

{#if drained}
  <Drained filter={$queue.filter} onwhole={reading.clear} />
{:else if view === "index"}
  {#if refused !== undefined}
    <Register><Refused surface="queue" {refused} /></Register>
  {/if}

  <Index
    {motion}
    bind:this={index}
    byDay={layout.byDay}
    items={rows}
    {selected}
    onselect={select}
    onprocess={(id) => {
      const item = rows.find((row) => row.id === id);
      if (item !== undefined) process(item);
    }}
  />

  {#if footed}
    <More
      loading={$queue.loading}
      first={rows.length === 0}
      offline={!pool.yes}
      failed={$queue.failure !== undefined}
      onmore={() => void client.loadQueue()}
    />
  {/if}
{:else}
  <Register slim={layout.slim}>
    {#if refused !== undefined}
      <Refused surface="queue" {refused} />
    {/if}

    {#each headed as one (one.key)}
      {#if one.kind === "day"}
        <Day at={one.at} {motion} />
      {:else}
        {@const row = one.row}
        <Row
          {motion}
          bind:this={drawn[row.id]}
          item={row}
          surface="queue"
          filter={$queue.filter}
          selected={selected === row.id}
          offline={!pool.yes}
          commands={selected === row.id ? commands : []}
          pending={undrained.has(row.id)}
          byDay={layout.byDay}
          slim={layout.slim}
          opens={one.opens}
          onselect={() => select(row.id)}
          onprocess={() => process(row)}
        />
      {/if}
    {/each}

    {#if footed}
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
