<script lang="ts">
  import { onMount, tick } from "svelte";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import QueueRow from "$components/queue/QueueRow.svelte";
  import RoutingComposer from "$components/routing/RoutingComposer.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { client } from "$lib/client";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { readMark, writeMark } from "$lib/scroll-mark";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();

  /** Processing happens in the row, and one row is open at a time. */
  let opened = $state<string | undefined>(undefined);

  /** Which item the routing modal is about, the row itself being behind it. */
  let routing = $state<string | undefined>(undefined);

  const subject = $derived(
    $queue.items.find((item) => item.id === routing) ?? undefined,
  );

  const drained = $derived(
    !$queue.loading &&
      $queue.failure === undefined &&
      $queue.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await client.loadQueue();
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

<Register furled={rail.furled}>
  <CaptureRow />

  {#if $queue.failure !== undefined}
    <Rail>queue</Rail>
    <Body>
      <span role="status" class="font-mono text-accent">{$queue.failure}</span>
    </Body>
  {/if}

  {#if drained}
    <Drained />
  {/if}

  {#each $queue.items as item (item.id)}
    <QueueRow
      {item}
      opened={opened === item.id}
      offline={!pool.yes}
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
