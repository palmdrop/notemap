<script lang="ts">
  import { page } from "$app/state";
  import type { Order } from "@notemap/client";

  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import { client } from "$lib/client";

  const queue = client.queue;
  const feed = client.feed;

  /** Chrome that acts on whichever surface is being read; settings has no end. */
  const reading = $derived(page.url.pathname === "/feed" ? "feed" : "queue");
  const surface = $derived(reading === "feed" ? $feed : $queue);
  const drawn = $derived(["/", "/feed"].includes(page.url.pathname));

  function turn(order: Order) {
    if (reading === "feed") void client.loadFeed(order);
    else void client.loadQueue(order);
  }
</script>

{#if drawn}
  <OrderSelector
    order={surface.order}
    reading={surface.loading}
    onchoose={turn}
  />
{/if}
