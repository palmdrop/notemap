<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import { rank, type Item, type RoutingRecord } from "@notemap/client";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import Row from "$components/item/Row.svelte";
  import ProcessingComposer from "$components/routing/ProcessingComposer.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { itemHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { notices } from "$lib/notices.svelte";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { refusalIn } from "$lib/refusal";
  import { saidOf } from "$lib/routing";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();

  /** Processing happens in the row, and one row is open at a time. */
  let opened = $state<string | undefined>(undefined);

  /**
   * The item the composer is for. Routing takes it out of the queue before the
   * pool answers, so the item is held rather than looked up.
   */
  let routing = $state<Item | undefined>(undefined);

  /**
   * The row that has just been processed, kept in the register for as long as
   * it is the open one. A decision is worth looking at after it is made — and
   * looking at it is what routing the same capture somewhere else starts from.
   */
  let holding = $state<string | undefined>(undefined);
  let held = $state<Item | undefined>(undefined);

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

  /** Opening any other row releases a held one: the register holds at most one. */
  function show(id: string) {
    opened = opened === id ? undefined : id;
    if (opened !== holding) holding = undefined;
  }

  function close() {
    opened = undefined;
    holding = undefined;
  }

  function process(item: Item) {
    routing = item;
  }

  /**
   * The composer sits over the register, so what is said about a decision is
   * the queue's to know. The row it was made about stays open wearing it.
   */
  function keep(item: Item) {
    holding = item.id;
    opened = item.id;
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

  /** Whether the key was pressed in something a person is writing in. */
  function writing(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
  }
</script>

<svelte:window
  onkeydown={(event) => {
    // The composer is a modal and answers this itself while it is up, and a
    // field answers for its own entry: closing the row under a half-written tag
    // would take the entry with it.
    if (event.key !== "Escape" || routing !== undefined) return;
    if (writing(event.target) || opened === undefined) return;
    close();
  }}
/>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  <CaptureRow />

  {#if refused !== undefined}
    <Refused surface="queue" {refused} />
  {/if}

  {#if drained}
    <Drained />
  {/if}

  {#each rows as row (row.id)}
    <Row
      item={row}
      opened={opened === row.id}
      offline={!pool.yes}
      furled={rail.furled}
      pending={undrained.has(row.id)}
      onopen={() => show(row.id)}
      onprocess={() => process(row)}
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
