<script lang="ts">
  import { onMount, tick, untrack } from "svelte";

  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import { isWhole, type Item } from "@notemap/client";

  import Row from "$components/item/Row.svelte";
  import Order from "$components/order/Order.svelte";
  import Index from "$components/queue/Index.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Day from "$components/primitives/register/Day.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import ClearFilters from "$components/tags/ClearFilters.svelte";
  import FilterPanel from "$components/tags/FilterPanel.svelte";
  import ViewChooser from "$components/view/ViewChooser.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import type { Command } from "$lib/command/command";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { listCommands, markCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay, dayAtFor, plain, type Drawn } from "$lib/days";
  import { filtering } from "$lib/filtering.svelte";
  import { placeOf } from "$lib/held";
  import { leave } from "$lib/leaving.svelte";
  import { Marking, PLAINLY, picked, type Picked } from "$lib/marking.svelte";
  import { batched } from "$lib/batched.svelte";
  import Confirming from "$components/batch/Confirming.svelte";
  import Marked from "$components/batch/Marked.svelte";
  import { anchored } from "$lib/anchored.svelte";
  import { moving } from "$lib/moving.svelte";
  import { readPast } from "$lib/paging";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { rows as layout } from "$lib/rows.svelte";
  import { refusalIn } from "$lib/refusal";
  import { restorePlace } from "$lib/scroll-mark";
  import { nameOf } from "$lib/destinations";
  import { NOTHING_CAPTURED, nothingMatches } from "$lib/said";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is selected at a time, as on the queue: it is the same row. */
  let selected = $state<string | undefined>(undefined);

  /** The rows marked for a batch, which any number may be. */
  const marking = new Marking();
  const batch = batched(marking, () => rows);
  /** Going back and forward moves through the views a filter was taken from. */
  let view = $derived<View>(viewFor(SURFACE, page.url));

  const reading = filtering(
    SURFACE,
    () => ({ view, order: $feed.order }),
    () => (selected = undefined),
  );

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});
  let index = $state<Index | undefined>(undefined);
  let filterPanel = $state<FilterPanel | undefined>(undefined);

  const refused = $derived(refusalIn($feed));

  /**
   * Whether there is more is what the pool's first page answers, so rows drawn
   * from the cache while it is read are offered nothing past them.
   */
  const footed = $derived(
    $feed.more && !($feed.fromCache && $feed.loading && $feed.items.length > 0),
  );

  const moved = moving(
    () => $feed.loading,
    () => $feed.items.length,
    () => !$feed.loading && !$feed.fromCache && $feed.failure === undefined,
  );

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await reading.arrive();
      restorePlace(reading.place);
    })();
  });

  function select(id: string, how: Picked = PLAINLY) {
    leave(() => {
      const marked = picked(
        marking,
        rows.map((row) => row.id),
        id,
        how,
        selected,
      );
      selected = marked ?? (selected === id ? undefined : id);
    });
  }

  /** Where the selected row last stood, for when it leaves. */
  let stood = $state<number | undefined>(undefined);

  /** The selected row's own copy, which outlives its place on a filtered feed. */
  const heldRow = $derived(client.held(selected ?? ""));

  /**
   * Nothing leaves the whole feed, but a row whose filter tag is taken off
   * leaves a filtered one, and is held where it stood until the selection
   * leaves it, as a decision's row is on the queue.
   */
  const rows = $derived.by(() => {
    const live = $feed.items;
    const kept = $heldRow;
    if (selected === undefined || kept === undefined) return live;

    // Read by when rows were processed, a decision moves its own row; it waits where it
    // stood until the selection leaves it, as one leaving a list does.
    const at = live.findIndex((row) => row.id === selected);
    const was = untrack(() => stood);
    if (at !== -1) {
      if ($feed.by !== "processed" || was === undefined || was === at)
        return live;
      const others = live.filter((row) => row.id !== selected);
      const place = Math.min(was, others.length);
      return [...others.slice(0, place), live[at]!, ...others.slice(place)];
    }

    const place = Math.min(
      was ?? placeOf(live, kept, $feed.order, $feed.by),
      live.length,
    );
    return [...live.slice(0, place), kept, ...live.slice(place)];
  });

  let stoodFor: string | undefined;

  $effect(() => {
    if (selected === undefined) stoodFor = undefined;
    const at = rows.findIndex((row) => row.id === selected);
    // Only the feed's own place for it: one this surface chose for a held
    // row would outlive a read that has not landed yet.
    if (at === -1 || !$feed.items.some((row) => row.id === selected)) return;
    // A row moved by its own decision keeps the place it was selected at.
    if ($feed.by === "processed" && stoodFor === selected) return;
    stood = at;
    stoodFor = selected;
  });

  const current = $derived(rows.find((row) => row.id === selected));

  /** The rows as drawn: under a heading per day, where the reader reads by day. */
  const headed = $derived(
    layout.byDay ? byDay(rows, dayAtFor($feed.by)) : plain(rows),
  );

  const motion = anchored(() => rows.map((row) => row.id), moved);

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
        feed,
        () => client.loadFeed(),
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

  /** Marks the selected row and the one a step along, so a held `shift` walks a range. */
  async function extend(step: 1 | -1) {
    if (selected !== undefined) marking.mark(selected);
    await walk(step);
    if (selected !== undefined) marking.mark(selected);
  }

  // A marked row a filter takes off the feed is no longer one a batch could reach.
  $effect(() => {
    const drawn = rows.map((row) => row.id);
    untrack(() => marking.keepOnly(drawn));
  });

  function process(item: Item) {
    void goto(processHref(item.id));
  }

  function read(wanted: View) {
    view = wanted;
    remember(SURFACE, wanted);
    replaceState(withView(page.url, wanted), {});
  }

  // Built once and read twice, as on the queue: the row draws these as buttons
  // and a chord takes the same objects.
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

  // The same two the queue publishes: a register walks the same way whatever
  // it holds, and a row offers what it draws as buttons.
  publish(() => [
    ...listCommands({
      ondown: () => leave(() => void walk(1)),
      onup: () => leave(() => void walk(-1)),
      onselect: () => {
        if (marking.on) {
          if (current !== undefined) marking.toggle(current.id);
        } else if (current === undefined) void walk(1);
        else if (drawn[current.id]?.isEditing() !== true) process(current);
      },
      ondeselect: () =>
        leave(() => {
          if (marking.on) marking.clear();
          else selected = undefined;
        }),
    }),
    ...markCommands({
      selected: current?.id,
      marking,
      onextend: (step) => leave(() => void extend(step)),
      ontag: () => {
        if (current !== undefined) drawn[current.id]?.tag();
      },
    }),
    // Nothing one row is given is offered while many are marked.
    ...(marking.on ? [] : reached()),
    { id: "filter", label: "filter", run: () => void filterPanel?.show() },
    {
      id: "view",
      label: "view",
      run: () => read(view === "timeline" ? "index" : "timeline"),
    },
  ]);
</script>

<Head>
  {#if marking.on}
    <Marked
      marked={rows.filter((row) => marking.has(row.id))}
      onbatch={(action) => batch.do(action)}
      onall={() => {
        const ids = rows.map((row) => row.id);
        const last = ids.at(-1);
        if (last !== undefined) marking.range(ids, last, ids[0]);
      }}
      onclear={() => marking.clear()}
    />
  {:else}
    <ViewChooser {view} onchoose={read} />
    <FilterPanel
      bind:this={filterPanel}
      surface={SURFACE}
      filter={reading.filter}
      ontoggle={reading.toggle}
      onclear={reading.clear}
    />
    <Order />
  {/if}
</Head>

{#if batch.asked !== undefined}
  {@const asked = batch.asked}
  <Confirming
    question={asked.question}
    notes={asked.notes}
    verb={asked.action.kind === "archive" ? "discard" : "route"}
    alarm={asked.action.kind === "archive"}
    onanswer={(go) => void batch.answer(go)}
  />
{/if}

{#snippet heading(one: Extract<Drawn<Item>, { kind: "day" }>)}
  <Day
    at={one.at}
    leads={refused === undefined && one.key === headed[0]?.key}
    {motion}
  />
{/snippet}

{#snippet entry(one: Extract<Drawn<Item>, { kind: "row" }>)}
  {@render whole(one.row, one.opens, motion)}
{/snippet}

{#snippet whole(
  item: Item,
  opens: boolean,
  motion: { readonly still: boolean } | undefined,
)}
  <Row
    {motion}
    bind:this={drawn[item.id]}
    {item}
    surface="feed"
    filter={$feed.filter.tags}
    selected={!marking.on && selected === item.id}
    marked={marking.has(item.id)}
    cursor={marking.on && selected === item.id}
    marking={marking.on}
    onbatch={(action) => batch.do(action)}
    offline={!pool.yes}
    commands={!marking.on && selected === item.id ? commands : []}
    pending={undrained.has(item.id)}
    layout={layout.drawn}
    {opens}
    onselect={(how) => select(item.id, how)}
    onprocess={marking.on ? undefined : () => void goto(processHref(item.id))}
  />
{/snippet}

<!-- Opened in the index, the row grows out of its line rather than sliding in. -->
{#snippet opened(item: Item, opens: boolean)}
  {@render whole(item, opens, undefined)}
{/snippet}

{#if view === "index" && !bare}
  {#if refused !== undefined}
    <Register><Refused surface="feed" {refused} /></Register>
  {/if}

  <Index
    {motion}
    bind:this={index}
    byDay={layout.byDay}
    dayAt={dayAtFor($feed.by)}
    leads={refused === undefined}
    items={rows}
    selected={marking.on ? undefined : selected}
    cursor={marking.on ? selected : undefined}
    slim={layout.slim}
    open={opened}
    marked={(id) => marking.has(id)}
    onselect={select}
    onprocess={(id) => {
      if (!marking.on) void goto(processHref(id));
    }}
  />

  {#if footed}
    <More
      loading={$feed.loading}
      first={rows.length === 0}
      offline={!pool.yes}
      failed={$feed.failure !== undefined}
      onmore={() => void client.loadFeed()}
    />
  {/if}
{:else}
  <Register slim={layout.slim}>
    {#if refused !== undefined}
      <Refused surface="feed" {refused} />
    {/if}

    {#if bare}
      <Rail>feed</Rail>
      <Body>
        {#if isWhole($feed.filter)}
          <Prose text={NOTHING_CAPTURED} />
        {:else}
          {nothingMatches($feed.filter, nameOf)}
          <ClearFilters onclick={reading.clear} />
        {/if}
      </Body>
    {/if}

    {#each headed as one (one.key)}
      <!-- Not an `{#if}`: that would be the block the transitions belong to,
           and they would play only when it turned, never as a row comes or
           goes. A render is transparent to them. -->
      {@render (one.kind === "day" ? heading : entry)(one as never)}
    {/each}

    {#if footed}
      <More
        loading={$feed.loading}
        first={rows.length === 0}
        offline={!pool.yes}
        failed={$feed.failure !== undefined}
        onmore={() => void client.loadFeed()}
      />
    {/if}
  </Register>
{/if}
