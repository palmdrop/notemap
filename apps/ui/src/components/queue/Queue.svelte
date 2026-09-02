<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import QueueRow from "$components/queue/QueueRow.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Notice from "$components/primitives/register/Notice.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { readMark, writeMark } from "$lib/scroll-mark";
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

  onMount(() => {
    void (async () => {
      await client.loadQueue(orderFor(SURFACE, page.url));
      await tick();
      window.scrollTo({ top: readMark(SURFACE) });
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload.
    const remember = () => writeMark(SURFACE, window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  });

  function show(id: string) {
    opened = opened === id ? undefined : id;
  }
</script>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  <CaptureRow />

  {#if refused !== undefined}
    <Notice surface="queue" {refused} />
  {/if}

  {#if drained}
    <Drained />
  {/if}

  {#each $queue.items as item (item.id)}
    <QueueRow
      {item}
      opened={opened === item.id}
      offline={!pool.yes}
      furled={rail.furled}
      pending={undrained.has(item.id)}
      onopen={() => show(item.id)}
      onroute={() => (routing = item.id)}
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

{#if subject !== undefined}
  <RoutingComposer
    item={subject.id}
    subject={client.says(subject) || subject.payload.type}
    content={subject.payload.content}
    tags={(subject.tags ?? []).map((tag) => tag.name)}
    onclose={() => (routing = undefined)}
  />
{/if}
