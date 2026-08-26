<script lang="ts">
  import { onMount } from "svelte";

  import { page } from "$app/state";

  import FeedRow from "$components/feed/FeedRow.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Notice from "$components/primitives/register/Notice.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { rail } from "$lib/rail.svelte";
  import { CACHED, NOTHING_CAPTURED } from "$lib/said";
  import { surface } from "$lib/surface.svelte";

  const SURFACE = "feed";

  const feed = client.feed;
  const undrained = pending();
  const said = surface();

  const cached = $derived(said.cached($feed));
  const refused = $derived(said.refused($feed));

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => void said.read(client.loadFeed(orderFor(SURFACE, page.url))));
</script>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  {#if cached || refused !== undefined}
    <Notice first surface="feed" said={cached ? CACHED : undefined} {refused} />
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
      first={at === 0 && !cached && refused === undefined}
      furled={rail.furled}
      pending={undrained.has(item.id)}
    />
  {/each}

  {#if $feed.more}
    <Foot>
      <Action disabled={$feed.loading} onclick={() => void client.loadFeed()}>
        {$feed.loading ? "loading…" : "load more"}
      </Action>
    </Foot>
  {/if}
</Register>
