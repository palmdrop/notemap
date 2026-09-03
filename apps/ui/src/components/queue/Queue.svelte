<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import type { Item } from "@notemap/client";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import Leaving from "$components/queue/Leaving.svelte";
  import QueueRow from "$components/queue/QueueRow.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { client } from "$lib/client";
  import { leaving } from "$lib/leaving.svelte";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { refusalIn } from "$lib/refusal";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();

  /** Processing happens in the row, and one row is open at a time. */
  let opened = $state<string | undefined>(undefined);

  let routing = $state<string | undefined>(undefined);

  const subject = $derived(
    $queue.items.find((item) => item.id === routing) ?? undefined,
  );

  const refused = $derived(refusalIn($queue));

  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      $queue.items.length === 0,
  );

  /**
   * What the queue holds, with the rows that have just left still standing
   * where they stood. A departure nobody saw reads as an item that vanished,
   * which is the one thing routing must never look like.
   */
  type Row = { item: Item; word?: string };

  const rows = $derived.by<Row[]>(() => {
    const live = $queue.items;
    const going = leaving
      .going()
      .filter((held) => !live.some((item) => item.id === held.item.id));

    if (going.length === 0) return live.map((item) => ({ item }));

    const standing = live.flatMap((item) => [
      ...going
        .filter((held) => held.before === item.id)
        .map((held) => ({ item: held.item, word: held.word })),
      { item },
    ]);

    const orphaned = going.filter(
      (held) =>
        held.before === undefined ||
        !live.some((item) => item.id === held.before),
    );

    return [
      ...standing,
      ...orphaned.map((held) => ({ item: held.item, word: held.word })),
    ];
  });

  onMount(() => {
    void (async () => {
      await client.loadQueue(orderFor(SURFACE, page.url));
      await tick();
      restorePlace(SURFACE);
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload, and on the way back from
    // reading one of these items.
    return keepPlace(SURFACE);
  });

  function show(id: string) {
    opened = opened === id ? undefined : id;
  }

  /** The composer sits over the register, so the row's place is the queue's to know. */
  function went(item: Item, word: string) {
    const at = $queue.items.findIndex((held) => held.id === item.id);
    leaving.after(item, word, $queue.items[at + 1]?.id);
  }
</script>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  <CaptureRow />

  {#if refused !== undefined}
    <Refused surface="queue" {refused} />
  {/if}

  {#if drained}
    <Drained />
  {/if}

  {#each rows as row, at (row.item.id)}
    {#if row.word !== undefined}
      <Leaving item={row.item} word={row.word} furled={rail.furled} />
    {:else}
      <QueueRow
        item={row.item}
        opened={opened === row.item.id}
        offline={!pool.yes}
        furled={rail.furled}
        pending={undrained.has(row.item.id)}
        before={rows[at + 1]?.item.id}
        onopen={() => show(row.item.id)}
        onroute={() => (routing = row.item.id)}
      />
    {/if}
  {/each}

  {#if $queue.more}
    <More
      loading={$queue.loading}
      offline={!pool.yes}
      onmore={() => void client.loadQueue()}
    />
  {/if}
</Register>

{#if subject !== undefined}
  <RoutingComposer
    item={subject.id}
    subject={client.says(subject) || subject.payload.type}
    content={subject.payload.content}
    tags={(subject.tags ?? []).map((tag) => tag.name)}
    onrouted={(word) => went(subject, word)}
    onclose={() => (routing = undefined)}
  />
{/if}
