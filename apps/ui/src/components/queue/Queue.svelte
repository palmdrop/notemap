<script lang="ts">
  import { onMount, tick } from "svelte";

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
  import { processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { discard, manual } from "$lib/quick";
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

  let view = $state<View>(viewFor(SURFACE, page.url));

  /** Each row as drawn, so a key can reach into the one that is selected. */
  let drawn = $state<Record<string, Row | undefined>>({});

  const refused = $derived(refusalIn($queue));

  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      $queue.items.length === 0,
  );

  const rows = $derived($queue.items);

  onMount(() => {
    // Back from the process surface with the row it was about still selected.
    // Read once: the address is put back so a reload does not reselect it.
    const arrived = page.url.searchParams.get(SELECTED);
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
      else drawn[arrived]?.reveal();
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload, and on the way back from
    // reading one of these items.
    return keepPlace(SURFACE);
  });

  function select(id: string) {
    selected = selected === id ? undefined : id;
  }

  function deselect() {
    selected = undefined;
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
    void tick().then(() => drawn[row.id]?.reveal());
  }

  function onkeydown(event: KeyboardEvent) {
    // A field answers for its own entry: acting on the row under a
    // half-written tag would take the entry with it.
    if (writing(event.target)) return;
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
        if (current !== undefined) discard(current);
        break;
      case "m":
        if (current !== undefined) void manual(current);
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
