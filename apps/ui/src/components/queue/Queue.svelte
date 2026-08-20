<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Order } from "@notemap/client";

  import CaptureRow from "$components/capture/CaptureRow.svelte";
  import Drained from "$components/queue/Drained.svelte";
  import QueueRow from "$components/queue/QueueRow.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Separator from "$components/primitives/register/Separator.svelte";
  import { client } from "$lib/client";
  import { composing } from "$lib/composing.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { readMark, writeMark } from "$lib/scroll-mark";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();

  /** Processing happens in the row, and one row is open at a time. */
  let opened = $state<string | undefined>(undefined);

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
    return () => {
      window.removeEventListener("scroll", remember);
      composing.end();
    };
  });

  /** Collapsing or leaving a row abandons whatever was being composed on it. */
  function show(id: string) {
    composing.end();
    opened = opened === id ? undefined : id;
  }

  function turn(order: Order) {
    composing.end();
    opened = undefined;
    void client.loadQueue(order);
  }
</script>

<Register aside={composing.open}>
  <CaptureRow />

  <Separator />

  <OrderSelector
    order={$queue.order}
    reading={$queue.loading}
    onchoose={turn}
  />

  {#if $queue.failure !== undefined}
    <Row>
      <Label name="queue" />
      <Content>
        <span role="status" class="font-mono text-accent">{$queue.failure}</span
        >
      </Content>
    </Row>
  {/if}

  {#if drained}
    <Drained />
  {/if}

  {#each $queue.items as item, at (item.id)}
    {#if at > 0}
      <Separator />
    {/if}
    <QueueRow
      {item}
      opened={opened === item.id}
      offline={!pool.yes}
      onopen={() => show(item.id)}
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
