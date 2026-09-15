<script lang="ts">
  import { onMount, tick } from "svelte";

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
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { commandsFor } from "$lib/command/item";
  import { listCommands } from "$lib/command/list";
  import { publish } from "$lib/command/stack.svelte";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { refusalIn } from "$lib/refusal";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is selected at a time, as on the queue: it is the same row. */
  let selected = $state<string | undefined>(undefined);
  let view = $state<View>(viewFor(SURFACE, page.url));

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});
  let index = $state<Index | undefined>(undefined);

  const refused = $derived(refusalIn($feed));

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await client.enter(SURFACE, orderFor(SURFACE, page.url));
      await tick();
      restorePlace(SURFACE);
    })();

    return keepPlace(SURFACE);
  });

  function select(id: string) {
    selected = selected === id ? undefined : id;
  }

  const rows = $derived($feed.items);
  const current = $derived(rows.find((row) => row.id === selected));

  function reveal(id: string) {
    drawn[id]?.reveal();
    index?.reveal(id);
  }

  /** Moves the selection one row along, and brings it into view. */
  function walk(step: 1 | -1) {
    if (rows.length === 0) return;
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

  // The same two the queue publishes: a register walks the same way whatever
  // it holds, and a row offers what it draws as buttons.
  publish(() => [
    ...listCommands({
      ondown: () => walk(1),
      onup: () => walk(-1),
      onselect: () => (current !== undefined ? process(current) : walk(1)),
      ondeselect: () => (selected = undefined),
    }),
    ...commands,
  ]);
</script>

<Head>
  <ViewToggle {view} onchoose={read} />
  <Order />
</Head>

{#if view === "index" && !bare}
  {#if refused !== undefined}
    <Register><Refused surface="feed" {refused} /></Register>
  {/if}

  <Index
    bind:this={index}
    items={rows}
    {selected}
    onselect={select}
    onprocess={(id) => void goto(processHref(id))}
  />

  {#if $feed.more}
    <More
      loading={$feed.loading}
      offline={!pool.yes}
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
        <Prose text={NOTHING_CAPTURED} />
      </Body>
    {/if}

    {#each rows as item (item.id)}
      <Row
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
        offline={!pool.yes}
        onmore={() => void client.loadFeed()}
      />
    {/if}
  </Register>
{/if}
