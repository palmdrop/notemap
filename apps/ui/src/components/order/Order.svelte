<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import type { RouteId } from "$app/types";
  import type { Order } from "@notemap/client";

  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { remember, withOrder, type Surface } from "$lib/order";

  const queue = client.queue;
  const feed = client.feed;

  /** Settings and an item have no end to start from, so they are offered none. */
  const READING: Partial<Record<RouteId, Surface>> = {
    "/": "queue",
    "/feed": "feed",
    "/log": "log",
  };

  const reading = $derived(
    page.route.id === null ? undefined : READING[page.route.id],
  );

  const order = $derived(
    reading === undefined
      ? undefined
      : reading === "log"
        ? log.order
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

    if (reading === "feed") void client.loadFeed(wanted);
    else if (reading === "queue") void client.loadQueue(wanted);
    else log.turn(wanted);
  }
</script>

{#if order !== undefined}
  <OrderSelector {order} reading={reloading} onchoose={turn} />
{/if}
