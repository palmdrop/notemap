<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import type { Order } from "@notemap/client";

  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import { client } from "$lib/client";
  import { remember, withOrder } from "$lib/order";

  const queue = client.queue;
  const feed = client.feed;

  /** Settings has no end to start from, so it is offered none. */
  const reading = $derived(page.url.pathname === "/feed" ? "feed" : "queue");
  const surface = $derived(reading === "feed" ? $feed : $queue);
  const drawn = $derived(["/", "/feed"].includes(page.url.pathname));

  function turn(order: Order) {
    remember(reading, order);
    replaceState(withOrder(page.url, order), {});

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
