<script lang="ts">
  import { onMount, tick, untrack } from "svelte";

  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import type { Item } from "@notemap/client";

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
  import TagFilter from "$components/tags/TagFilter.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import type { Command } from "$lib/command/command";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { listCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { byDay, plain, type Drawn } from "$lib/days";
  import { filtering } from "$lib/filtering.svelte";
  import { placeOf } from "$lib/held";
  import { leave } from "$lib/leaving.svelte";
  import { moving } from "$lib/moving.svelte";
  import { readPast } from "$lib/paging";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { rows as layout } from "$lib/rows.svelte";
  import { refusalIn } from "$lib/refusal";
  import { restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is selected at a time, as on the queue: it is the same row. */
  let selected = $state<string | undefined>(undefined);
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
  let tagFilter = $state<TagFilter | undefined>(undefined);

  const refused = $derived(refusalIn($feed));

  /**
   * Whether there is more is what the pool's first page answers, so rows drawn
   * from the cache while it is read are offered nothing past them.
   */
  const footed = $derived(
    $feed.more && !($feed.fromCache && $feed.loading && $feed.items.length > 0),
  );

  const motion = moving(
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

  function select(id: string) {
    leave(() => {
      selected = selected === id ? undefined : id;
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
    if (
      selected === undefined ||
      kept === undefined ||
      live.some((row) => row.id === selected)
    ) {
      return live;
    }
    const place = Math.min(
      untrack(() => stood) ?? placeOf(live, kept, $feed.order),
      live.length,
    );
    return [...live.slice(0, place), kept, ...live.slice(place)];
  });

  $effect(() => {
    const at = rows.findIndex((row) => row.id === selected);
    // Only the feed's own place for it: one this surface chose for a held
    // row would outlive a read that has not landed yet.
    if (at !== -1 && $feed.items.some((row) => row.id === selected)) {
      stood = at;
    }
  });

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
        if (current === undefined) void walk(1);
        else if (drawn[current.id]?.isEditing() !== true) process(current);
      },
      ondeselect: () => leave(() => (selected = undefined)),
    }),
    ...reached(),
    { id: "filter", label: "filter", run: () => void tagFilter?.show() },
  ]);
</script>

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

{#snippet heading(one: Extract<Drawn<Item>, { kind: "day" }>)}
  <Day at={one.at} {motion} />
{/snippet}

{#snippet entry(one: Extract<Drawn<Item>, { kind: "row" }>)}
  {@const item = one.row}
  <Row
    {motion}
    bind:this={drawn[item.id]}
    {item}
    surface="feed"
    filter={$feed.filter}
    selected={selected === item.id}
    offline={!pool.yes}
    commands={selected === item.id ? commands : []}
    pending={undrained.has(item.id)}
    layout={layout.drawn}
    opens={one.opens}
    onselect={() => select(item.id)}
    onprocess={() => void goto(processHref(item.id))}
  />
{/snippet}

{#if view === "index" && !bare}
  {#if refused !== undefined}
    <Register><Refused surface="feed" {refused} /></Register>
  {/if}

  <Index
    {motion}
    bind:this={index}
    byDay={layout.byDay}
    items={rows}
    {selected}
    onselect={select}
    onprocess={(id) => void goto(processHref(id))}
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
        {#if $feed.filter.length === 0}
          <Prose text={NOTHING_CAPTURED} />
        {:else}
          Nothing is tagged {$feed.filter.join(" · ")}.
          <button
            type="button"
            class="ml-[1ch] hover:underline"
            onclick={reading.clear}
          >
            whole feed
          </button>
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
