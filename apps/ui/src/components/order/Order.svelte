<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import type { Order } from "@notemap/client";

  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { orderFor, remember, withOrder, type Surface } from "$lib/order";

  const queue = client.queue;
  const feed = client.feed;

  /** Settings has no end to start from, so it is offered none. */
  const READING: Record<string, Surface> = {
    "/": "queue",
    "/feed": "feed",
    "/log": "log",
  };

  const reading = $derived(READING[page.url.pathname]);

  // The log's order lives on the URL and nowhere else, so the control draws it
  // from there rather than from a page that has not been turned around yet.
  const order = $derived(
    reading === undefined
      ? undefined
      : reading === "log"
        ? orderFor("log", page.url)
        : reading === "feed"
          ? $feed.order
          : $queue.order,
  );

  const reloading = $derived(
    reading === "log"
      ? log.loading
      : reading === "feed"
        ? $feed.loading
        : $queue.loading,
  );

  function turn(wanted: Order) {
    if (reading === undefined) return;

    remember(reading, wanted);
    replaceState(withOrder(page.url, wanted), {});

    // The log route reads the URL back; the other two hold a page of their own.
    if (reading === "feed") void client.loadFeed(wanted);
    else if (reading === "queue") void client.loadQueue(wanted);
  }
</script>

{#if order !== undefined}
  <OrderSelector {order} reading={reloading} onchoose={turn} />
{/if}
