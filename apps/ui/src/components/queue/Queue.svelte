<script lang="ts" module>
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import type { Item as Held } from "@notemap/client";

  /**
   * What the queue last held of each item, kept across the surface being
   * drawn again, so a row in its window survives leaving and coming back.
   */
  const seen = new SvelteMap<string, Held>();
</script>

<script lang="ts">
  import { quick } from "$lib/quicking.svelte";
  import { resolve } from "$app/paths";

  import Icon from "$components/primitives/icon/Icon.svelte";
  import { width } from "$lib/breakpoint";
  import { sayLanded } from "$lib/landed";
  import { heldHint } from "$lib/held-hint.svelte";
  import { onMount, tick, untrack } from "svelte";

  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import { filterSize, type Item } from "@notemap/client";

  import Capture from "$components/capture/Capture.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import Index from "$components/queue/Index.svelte";
  import Row from "$components/item/Row.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import { isCapture } from "$lib/refused";
  import RefusedRow from "./RefusedRow.svelte";
  import Day from "$components/primitives/register/Day.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import FilterPanel from "$components/tags/FilterPanel.svelte";
  import { searching } from "$components/frame/searching.svelte";
  import { itemHref } from "$components/item/href";
  import { client } from "$lib/client";
  import type { Command } from "$lib/command/command";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { listCommands, markCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay, type Drawn } from "$lib/days";
  import { filtering } from "$lib/filtering.svelte";
  import { placeOf } from "$lib/held";
  import { firings, phaseOf } from "$lib/firings.svelte";
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
  import { restorePlace } from "$lib/scroll-mark";
  import { refusalIn } from "$lib/refusal";
  import { remember, viewFor, withView, type View } from "$lib/view";

  /** Drawn beside an open item when wide: the list without its capture box. */
  let { beside = false }: { beside?: boolean } = $props();

  const SURFACE = "queue";

  /** On the queue's address, once, on the way back from processing. */
  const SELECTED = "selected";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();

  const queueCount = client.counts.queue;

  /** Processing starts on the row, and one row is selected at a time. */
  let selected = $state<string | undefined>(undefined);

  /** The rows marked for a batch, which any number may be. */
  const marking = new Marking();
  const batch = batched(marking, () => rows);

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
  let filterPanel = $state<FilterPanel | undefined>(undefined);

  const refused = $derived(refusalIn($queue));

  /** Captures the pool refused, kept on this device: rows at the queue's end. */
  const outbox = client.outbox;
  const kept = $derived(
    $outbox.filter((held) => held.state === "refused").filter(isCapture),
  );

  /**
   * Whether there is more is what the pool's first page answers, so rows drawn
   * from the cache while it is read are offered nothing past them.
   */
  const footed = $derived(
    $queue.more &&
      !($queue.fromCache && $queue.loading && $queue.items.length > 0),
  );

  const moved = moving(
    () => $queue.loading,
    () => $queue.items.length,
    () => !$queue.loading && !$queue.fromCache && $queue.failure === undefined,
  );

  /** The selected row's own copy, which outlives its place on the queue. */
  const heldRow = $derived(client.held(selected ?? ""));

  /**
   * A decision takes the selected row off the queue, and the row stays drawn
   * where it stood until the selection leaves it: the decision can be looked
   * at, and taken back from the row, after it is made.
   */
  /**
   * A route in its window keeps its row, by hand or by trigger tag, until the
   * window closes and the row slides out. The pool has already taken the item
   * off the queue, so the row is drawn from what this list last held of it,
   * or, after a reload, from the item read again.
   */
  $effect(() => {
    for (const row of $queue.items) seen.set(row.id, row);
  });
  const asked = new SvelteSet<string>();
  $effect(() => {
    for (const firing of firings.open) {
      if (seen.has(firing.item) || asked.has(firing.item)) continue;
      asked.add(firing.item);
      void client.item(firing.item).then(
        ({ item }) => {
          // Only one whose every record is this window's was queue work: a
          // route again from the feed is not.
          const first =
            item !== undefined &&
            item.archived === undefined &&
            (item.routing === undefined ||
              item.routing.records === item.routing.pending);
          if (first) seen.set(item.id, item);
        },
        () => {},
      );
    }
  });
  const inWindow = $derived(
    firings.open
      .filter(
        (firing) =>
          phaseOf(firing, firings.now) === "window" &&
          !$queue.items.some((row) => row.id === firing.item) &&
          seen.has(firing.item),
      )
      .map((firing) => seen.get(firing.item) as Item),
  );

  const rows = $derived.by(() => {
    const live = withWindows($queue.items);
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

  function withWindows(live: readonly Item[]): readonly Item[] {
    let drawn = [...live];
    for (const kept of inWindow) {
      if (drawn.some((row) => row.id === kept.id)) continue;
      const place = placeOf(drawn, kept, $queue.order);
      drawn = [...drawn.slice(0, place), kept, ...drawn.slice(place)];
    }
    return drawn;
  }

  /** A held row is still drawn, so the queue is not empty until it is let go. */
  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      rows.length === 0,
  );

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

  function select(id: string, how: Picked = PLAINLY) {
    leave(() => {
      const marked = picked(
        marking,
        rows.map((row) => row.id),
        id,
        how,
        selected,
      );
      // Letting go of the last mark ends the mode with nothing selected,
      // rather than leaving the row it ended on selected with its strip.
      if (marked !== undefined && !marking.on) deselect();
      else if (marked !== undefined) selected = marked;
      else if (selected === id) deselect();
      else selected = id;
    });
  }

  /** Marks the selected row and the one a step along, so a held `shift` walks a range. */
  async function extend(step: 1 | -1) {
    if (selected !== undefined) marking.mark(selected);
    await walk(step);
    if (selected !== undefined) marking.mark(selected);
  }

  // A marked row that leaves the queue is no longer one a batch could reach.
  $effect(() => {
    const drawn = rows.map((row) => row.id);
    untrack(() => marking.keepOnly(drawn));
  });

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
    quick.open(item.id);
  }

  function read(wanted: View) {
    view = wanted;
    remember(SURFACE, wanted);
    replaceState(withView(page.url, wanted), {});
  }

  const current = $derived(rows.find((row) => row.id === selected));

  /** The rows as drawn: under a heading per day, where the reader reads by day. */
  const headed = $derived(byDay(rows));

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
        if (marking.on) {
          if (current !== undefined) marking.toggle(current.id);
        } else if (current !== undefined) {
          if (drawn[current.id]?.isEditing() !== true) process(current);
        } else if (atCapture) capture?.take();
        else void walk(1);
      },
      ondeselect: () =>
        leave(() => (marking.on ? marking.clear() : deselect())),
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
    ...(atCapture
      ? [
          { id: "tag", label: "tag", run: () => capture?.tag() },
          { id: "edit", label: "write", run: () => capture?.take() },
          { id: "capture", label: "capture", run: () => capture?.commit() },
        ]
      : []),
    {
      id: "filter",
      label: "filter",
      count: filterSize(reading.filter),
      run: () => void filterPanel?.show(),
    },
    {
      id: "search",
      label: "search",
      field: { words: reading.words, onsearch: reading.search },
      run: () => searching.focus(),
    },
    {
      id: "view",
      label: "view",
      run: () => read(view === "timeline" ? "index" : "timeline"),
    },
  ]);
</script>

<svelte:head>
  <title>
    Queue ({$queueCount}) | Notemap
  </title>
</svelte:head>

{#if width.wide && !beside}
  <Capture
    bind:this={capture}
    focus={arrived === null}
    selected={atCapture}
    onfocus={captureFocused}
    oncaptured={(item) => sayLanded(item, $queue.order)}
  />
{:else if !width.wide}
  <!-- Clear of the status line, a few pixels between, and there when the
       line is gone too. -->
  <a
    href={resolve("/capture")}
    aria-label="Capture"
    title="Capture"
    class="fixed right-4 bottom-[calc(2.75rem+0.5rem+env(safe-area-inset-bottom))] z-20 grid size-fab place-items-center rounded-full border border-rule bg-chip no-underline hover:no-underline active:bg-off-down"
  >
    <Icon name="plus" class="size-10" />
  </a>
{/if}

{#if marking.on}
  <Head>
    <Marked
      marked={rows.filter((row) => marking.has(row.id))}
      full={marking.full}
      onbatch={(action) => batch.do(action)}
      onall={() => {
        const ids = rows.map((row) => row.id);
        const last = ids.at(-1);
        if (last !== undefined) marking.range(ids, last, ids[0] ?? last);
      }}
      onclear={() => marking.clear()}
    />
  </Head>
{/if}

<FilterPanel
  bind:this={filterPanel}
  surface={SURFACE}
  filter={reading.filter}
  {view}
  onview={read}
  ontoggle={reading.toggle}
  onclear={reading.clear}
/>

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
    count={one.count}
    leads={refused === undefined && one.key === headed[0]?.key}
    {motion}
  />
{/snippet}

{#snippet entry(one: Extract<Drawn<Item>, { kind: "row" }>)}
  {@render whole(one.row, one.opens, motion)}
{/snippet}

{#snippet whole(
  row: Item,
  opens: boolean,
  motion: { readonly still: boolean } | undefined,
)}
  <Row
    {motion}
    bind:this={drawn[row.id]}
    item={row}
    surface="queue"
    filter={$queue.filter.tags}
    terms={$queue.filter.words}
    selected={!marking.on && selected === row.id}
    marked={marking.has(row.id)}
    cursor={marking.on && selected === row.id}
    marking={marking.on}
    onbatch={(action) => batch.do(action)}
    offline={!pool.yes}
    pending={undrained.has(row.id)}
    firing={firings.open.find((firing) => firing.item === row.id)}
    {opens}
    onselect={(how) => select(row.id, how)}
    onprocess={marking.on ? undefined : () => process(row)}
  />
{/snippet}

<!-- Opened in the index, the row grows out of its line rather than sliding in. -->
{#snippet opened(row: Item, opens: boolean)}
  {@render whole(row, opens, undefined)}
{/snippet}

<!-- The list stays drawn while the queue is drained, so the first row into it
     and the last row out of it move as any other. -->
{#if !width.wide && heldHint.due && rows.length > 1 && !marking.on}
  <p class="-mx-3.5 px-gutter py-2 text-small text-muted">
    Hold a row to select several.
  </p>
{/if}

{#if view === "index"}
  {#if refused !== undefined}
    <Register><Refused surface="queue" {refused} /></Register>
  {/if}

  {#if kept.length > 0}
    <Register>
      {#each kept as held (held.id)}
        <RefusedRow {held} />
      {/each}
    </Register>
  {/if}

  <Index
    {motion}
    bind:this={index}
    leads={refused === undefined}
    items={rows}
    selected={marking.on ? undefined : selected}
    cursor={marking.on ? selected : undefined}
    open={opened}
    marked={(id) => marking.has(id)}
    marking={marking.on}
    onselect={select}
    onprocess={(id) => {
      const item = rows.find((row) => row.id === id);
      if (item !== undefined && !marking.on) process(item);
    }}
  />

  {#if footed}
    <More
      loading={$queue.loading}
      first={rows.length === 0}
      shown={rows.length}
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

    {#each headed as one (one.key)}
      <!-- Not an `{#if}`: that would be the block the transitions belong to,
           and they would play only when it turned, never as a row comes or
           goes. A render is transparent to them. -->
      {@render (one.kind === "day" ? heading : entry)(one as never)}
    {/each}

    {#each kept as held (held.id)}
      <RefusedRow {held} />
    {/each}

    {#if footed}
      <More
        loading={$queue.loading}
        first={rows.length === 0}
        shown={rows.length}
        offline={!pool.yes}
        failed={$queue.failure !== undefined}
        onmore={() => void client.loadQueue()}
      />
    {/if}
  </Register>
{/if}

{#if drained}
  <Drained filter={$queue.filter} onwhole={reading.clear} />
{/if}
