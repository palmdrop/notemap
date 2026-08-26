<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import QueueRow from "$components/queue/QueueRow.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Notice from "$components/primitives/register/Notice.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { readMark, writeMark } from "$lib/scroll-mark";
  import { CACHED } from "$lib/said";
  import { surface } from "$lib/surface.svelte";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();
  const undrained = pending();
  const said = surface();

  /** Processing happens in the row, and one row is open at a time. */
  let opened = $state<string | undefined>(undefined);

  let routing = $state<string | undefined>(undefined);

  const subject = $derived(
    $queue.items.find((item) => item.id === routing) ?? undefined,
  );

  const cached = $derived(said.cached($queue));
  const refused = $derived(said.refused($queue));

  const drained = $derived(
    !$queue.loading &&
      !$queue.fromCache &&
      $queue.failure === undefined &&
      $queue.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await said.read(client.loadQueue(orderFor(SURFACE, page.url)));
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

  {#if cached || refused !== undefined}
    <Notice surface="queue" said={cached ? CACHED : undefined} {refused} />
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
    <Foot>
      <Action disabled={$queue.loading} onclick={() => void client.loadQueue()}>
        {$queue.loading ? "loading…" : "load more"}
      </Action>
    </Foot>
  {/if}
</Register>

{#if subject !== undefined}
  <RoutingComposer
    item={subject.id}
    subject={client.says(subject) || subject.payload.type}
    onclose={() => (routing = undefined)}
  />
{/if}
