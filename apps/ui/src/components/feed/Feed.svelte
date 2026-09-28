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
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import Filtered from "$components/tags/Filtered.svelte";
  import TagList from "$components/tags/TagList.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import type { Command } from "$lib/command/command";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { listCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { filtered, filterFor, GOING, placeKey } from "$lib/filter";
  import { leave } from "$lib/leaving.svelte";
  import { moving } from "$lib/moving.svelte";
  import { orderFor } from "$lib/order";
  import { readPast } from "$lib/paging";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { refusalIn } from "$lib/refusal";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";
  import {
    remember,
    remembered,
    viewFor,
    withView,
    type View,
  } from "$lib/view";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is selected at a time, as on the queue: it is the same row. */
  let selected = $state<string | undefined>(undefined);
  let view = $state<View>(viewFor(SURFACE, page.url));

  /** The tags the feed is read through, off its address. */
  const filter = $derived(filterFor(page.url));
  const place = $derived(placeKey(SURFACE, filter));

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});
  let index = $state<Index | undefined>(undefined);
  let tagList = $state<TagList | undefined>(undefined);

  const refused = $derived(refusalIn($feed));

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
      await client.enter(SURFACE, orderFor(SURFACE, page.url), filter);
      await tick();
      restorePlace(place);
    })();
  });

  $effect(() => keepPlace(place));

  // Going back and forward moves through filters, and through the views a
  // filter was taken from, so both follow the address when it changes.
  let entered = untrack(() => place);
  $effect(() => {
    const now = place;
    const tags = filter;
    view = viewFor(SURFACE, page.url);
    if (now === entered) return;
    entered = now;
    untrack(() => {
      selected = undefined;
      void (async () => {
        await client.enter(SURFACE, orderFor(SURFACE, page.url), tags);
        await tick();
        restorePlace(now);
      })();
    });
  });

  /** Takes one tag off the filter. */
  function lift(tag: string) {
    leave(
      () =>
        void goto(
          filtered(
            page.url,
            filter.filter((each) => each !== tag),
            view,
          ),
          GOING,
        ),
    );
  }

  /** Adds a tag to the filter and goes back to reading items. */
  function narrow(tag: string) {
    leave(
      () =>
        void goto(
          filtered(page.url, [...filter, tag], remembered(SURFACE)),
          GOING,
        ),
    );
  }

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
    const place = Math.min(untrack(() => stood) ?? live.length, live.length);
    return [...live.slice(0, place), kept, ...live.slice(place)];
  });

  $effect(() => {
    const at = rows.findIndex((row) => row.id === selected);
    if (at !== -1) stood = at;
  });

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
  publish(() =>
    view === "tags"
      ? listCommands({
          ondown: () => tagList?.walk(1),
          onup: () => tagList?.walk(-1),
          onselect: () => tagList?.take(),
          ondeselect: () => {
            if (tagList?.holding() === true) tagList.unmark();
            else if (filter.length > 0) lift(filter.at(-1) ?? "");
          },
        })
      : [
          ...listCommands({
            ondown: () => leave(() => void walk(1)),
            onup: () => leave(() => void walk(-1)),
            onselect: () => {
              if (current === undefined) void walk(1);
              else if (drawn[current.id]?.isEditing() !== true)
                process(current);
            },
            ondeselect: () =>
              leave(() => {
                if (selected === undefined && filter.length > 0) {
                  lift(filter.at(-1) ?? "");
                } else selected = undefined;
              }),
          }),
          ...reached(),
        ],
  );
</script>

<Head>
  <ViewToggle {view} onchoose={read} />
  <Order />
</Head>
<Filtered {filter} onlift={lift} />

{#if view === "tags"}
  <TagList bind:this={tagList} surface={SURFACE} {filter} onchoose={narrow} />
{:else if view === "index" && !bare}
  {#if refused !== undefined}
    <Register><Refused surface="feed" {refused} /></Register>
  {/if}

  <Index
    {motion}
    bind:this={index}
    items={rows}
    {selected}
    onselect={select}
    onprocess={(id) => void goto(processHref(id))}
  />

  {#if $feed.more}
    <More
      loading={$feed.loading}
      first={rows.length === 0}
      offline={!pool.yes}
      failed={$feed.failure !== undefined}
      onmore={() => void client.loadFeed()}
    />
  {/if}
{:else}
  <Register>
    {#if refused !== undefined}
      <Refused surface="feed" {refused} />
    {/if}

    {#if bare}
      <Rail>feed</Rail>
      <Body>
        {#if filter.length === 0}
          <Prose text={NOTHING_CAPTURED} />
        {:else}
          Nothing is tagged {filter.join(" · ")}.
          <button
            type="button"
            class="ml-[1ch] hover:underline"
            onclick={() =>
              leave(() => void goto(filtered(page.url, [], view), GOING))}
          >
            whole feed
          </button>
        {/if}
      </Body>
    {/if}

    {#each rows as item (item.id)}
      <Row
        {motion}
        bind:this={drawn[item.id]}
        {item}
        surface="feed"
        selected={selected === item.id}
        offline={!pool.yes}
        commands={selected === item.id ? commands : []}
        pending={undrained.has(item.id)}
        onselect={() => select(item.id)}
        onprocess={() => void goto(processHref(item.id))}
      />
    {/each}

    {#if $feed.more}
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
