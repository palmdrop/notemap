<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import type { Item } from "@notemap/client";

  import Row from "$components/item/Row.svelte";
  import Order from "$components/order/Order.svelte";
  import ProcessingComposer from "$components/routing/ProcessingComposer.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { notices } from "$lib/notices.svelte";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { refusalIn } from "$lib/refusal";
  import { keyFor } from "$lib/routing";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is open at a time, as on the queue: it is the same row. */
  let opened = $state<string | undefined>(undefined);
  let routing = $state<Item | undefined>(undefined);

  const refused = $derived(refusalIn($feed));

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await client.enter(SURFACE, orderFor(SURFACE, page.url));
      await tick();
      restorePlace(SURFACE);
    })();

    return keepPlace(SURFACE);
  });
</script>

<Head>
  <span class="ml-auto"><Order /></span>
</Head>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  {#if refused !== undefined}
    <Refused first surface="feed" {refused} />
  {/if}

  {#if bare}
    <Rail first>feed</Rail>
    <Body first>
      <Prose text={NOTHING_CAPTURED} />
    </Body>
  {/if}

  {#each $feed.items as item, at (item.id)}
    <Row
      {item}
      first={at === 0 && refused === undefined}
      opened={opened === item.id}
      offline={!pool.yes}
      furled={rail.furled}
      pending={undrained.has(item.id)}
      onopen={() => (opened = opened === item.id ? undefined : item.id)}
      onprocess={() => (routing = item)}
    />
  {/each}

  {#if $feed.more}
    <More
      loading={$feed.loading}
      offline={!pool.yes}
      onmore={() => void client.loadFeed()}
    />
  {/if}
</Register>

<!-- The feed keeps every row it holds, so a decision made here is drawn on the
     row a moment later rather than reported to somebody looking at it. The
     record is remembered so the log does not report it back as news. -->
{#if routing !== undefined}
  {@const subject = routing}
  <ProcessingComposer
    item={subject}
    onrouted={(record) => notices.mark(keyFor(record.id))}
    onclose={() => (routing = undefined)}
  />
{/if}
