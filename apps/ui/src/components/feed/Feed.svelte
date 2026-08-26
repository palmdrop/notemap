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
  import { refusalIn } from "$lib/refusal";
  import { NOTHING_CAPTURED } from "$lib/said";

  const SURFACE = "feed";

  const feed = client.feed;
  const undrained = pending();

  const refused = $derived(refusalIn($feed));

  const bare = $derived(
    !$feed.loading &&
      !$feed.fromCache &&
      $feed.failure === undefined &&
      $feed.items.length === 0,
  );

  onMount(() => void client.loadFeed(orderFor(SURFACE, page.url)));
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
    <Foot>
      <Action disabled={$feed.loading} onclick={() => void client.loadFeed()}>
        {$feed.loading ? "loading…" : "load more"}
      </Action>
    </Foot>
  {/if}
</Register>
