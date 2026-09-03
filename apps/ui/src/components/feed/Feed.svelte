<script lang="ts">
  import { onMount, tick } from "svelte";

  import { page } from "$app/state";

  import FeedRow from "$components/feed/FeedRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Notice from "$components/primitives/register/Notice.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { refusalIn } from "$lib/refusal";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  const refused = $derived(refusalIn($feed));

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => {
    void (async () => {
      await client.loadFeed(orderFor(SURFACE, page.url));
      await tick();
      restorePlace(SURFACE);
    })();

    return keepPlace(SURFACE);
  });
</script>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  {#if refused !== undefined}
    <Notice first surface="feed" {refused} />
  {/if}

  {#if bare}
    <Rail first>feed</Rail>
    <Body first>
      <Prose text={NOTHING_CAPTURED} />
    </Body>
  {/if}

  {#each $feed.items as item, at (item.id)}
    <FeedRow
      {item}
      first={at === 0 && refused === undefined}
      furled={rail.furled}
      pending={undrained.has(item.id)}
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
