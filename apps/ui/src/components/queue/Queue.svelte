<script lang="ts">
  import { onMount, tick } from "svelte";

  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import { rank, type Item, type RoutingRecord } from "@notemap/client";

  import Capture from "$components/capture/Capture.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import Index from "$components/queue/Index.svelte";
  import Row from "$components/item/Row.svelte";
  import Order from "$components/order/Order.svelte";
  import ProcessingComposer from "$components/routing/ProcessingComposer.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { itemHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { notices } from "$lib/notices.svelte";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { discard, manual } from "$lib/quick";
  import { reachable } from "$lib/reachable.svelte";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { refusalIn } from "$lib/refusal";
  import { saidOf } from "$lib/routing";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();

  /** Processing starts on the row, and one row is selected at a time. */
  let selected = $state<string | undefined>(undefined);

  let view = $state<View>(viewFor(SURFACE, page.url));

  /**
   * The item the composer is for. Routing takes it out of the queue before the
   * pool answers, so the item is held rather than looked up.
   */
  let routing = $state<Item | undefined>(undefined);

  /**
   * The row that has just been processed, kept in the register for as long as
   * it is the selected one. A decision is worth looking at after it is made —
   * and looking at it is what routing the same capture somewhere else starts
   * from.
   */
  let holding = $state<string | undefined>(undefined);
  let held = $state<Item | undefined>(undefined);

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});

  const refused = $derived(refusalIn($queue));

  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      $queue.items.length === 0 &&
      held === undefined,
  );

  // The client's own copy, so the row follows what the cache learns about it —
  // a second routing, or a decision taken back, without a read of its own.
  $effect(() => {
    const id = holding;
    if (id === undefined) {
      held = undefined;
      return;
    }

    const watching = client.held(id).subscribe((item) => {
      held = item;
    });
    return () => watching.unsubscribe();
  });

  /**
   * What the register draws: the queue, with a held row back at its own rank.
   * By rank rather than by the neighbour it had, because the key is capture
   * time and a row that returns anywhere else is a row that moved.
   */
  const rows = $derived.by<readonly Item[]>(() => {
    const live = $queue.items;
    const kept = held;
    if (kept === undefined || live.some((item) => item.id === kept.id))
      return live;

    const at = live.findIndex((item) => behind(item, kept));
    return at === -1
      ? [...live, kept]
      : [...live.slice(0, at), kept, ...live.slice(at)];
  });

  /** Whether one row sorts after another, in the order the surface is read in. */
  function behind(item: Item, than: Item): boolean {
    return $queue.order === "newest-first"
      ? rank(item) < rank(than)
      : rank(item) > rank(than);
  }

  onMount(() => {
    void (async () => {
      await client.enter(SURFACE, orderFor(SURFACE, page.url));
      await tick();
      restorePlace(SURFACE);
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload, and on the way back from
    // reading one of these items.
    return keepPlace(SURFACE);
  });

  /** Selecting any other row releases a held one: the register holds at most one. */
  function select(id: string) {
    selected = selected === id ? undefined : id;
    if (selected !== holding) holding = undefined;
  }

  function deselect() {
    selected = undefined;
    holding = undefined;
  }

  function process(item: Item) {
    routing = item;
  }

  /**
   * What is said about a decision is the queue's to know. The row it was made
   * about stays selected wearing it.
   */
  function keep(item: Item) {
    holding = item.id;
    selected = item.id;
  }

  function went(item: Item, record: RoutingRecord) {
    notices.raise(
      saidOf(record, nameOf, {
        about: aboutItem(item),
        href: itemHref(item.id),
      }),
    );
    keep(item);
  }

  function read(wanted: View) {
    view = wanted;
    remember(SURFACE, wanted);
    replaceState(withView(page.url, wanted), {});
  }

  /** Whether the key was pressed in something a person is writing in. */
  function writing(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
  }

  const current = $derived(rows.find((row) => row.id === selected));

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
    if (selected !== holding) holding = undefined;
    void tick().then(() => drawn[row.id]?.reveal());
  }

  function onkeydown(event: KeyboardEvent) {
    // The composer is a modal and answers this itself while it is up, and a
    // field answers for its own entry: acting on the row under a half-written
    // tag would take the entry with it.
    if (routing !== undefined || writing(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    switch (event.key) {
      case "Escape":
        if (selected !== undefined) deselect();
        return;
      case "j":
        walk(1);
        break;
      case "k":
        walk(-1);
        break;
      case "Enter":
        if (current !== undefined) process(current);
        else walk(1);
        break;
      case "p":
        if (current !== undefined) process(current);
        break;
      case "d":
        if (current !== undefined) {
          discard(current);
          keep(current);
        }
        break;
      case "m":
        if (current !== undefined) {
          const item = current;
          void manual(item).then(() => keep(item));
        }
        break;
      case "+":
        if (current !== undefined) drawn[current.id]?.tag();
        break;
      default:
        return;
    }
    event.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<Capture />

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
      offline={!pool.yes}
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
        pending={undrained.has(row.id)}
        onselect={() => select(row.id)}
        onprocess={() => process(row)}
        ondecided={() => keep(row)}
      />
    {/each}

    {#if $queue.more}
      <More
        loading={$queue.loading}
        offline={!pool.yes}
        onmore={() => void client.loadQueue()}
      />
    {/if}
  </Register>
{/if}

{#if routing !== undefined}
  {@const subject = routing}
  <ProcessingComposer
    item={subject}
    onrouted={(record) => went(subject, record)}
    ondiscarded={() => keep(subject)}
    onfired={() => keep(subject)}
    onclose={() => (routing = undefined)}
  />
{/if}
