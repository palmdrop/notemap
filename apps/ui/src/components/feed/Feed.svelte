<script lang="ts">
  import { onMount } from "svelte";

  import FeedRow from "$components/feed/FeedRow.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { rail } from "$lib/rail.svelte";

  const feed = client.feed;

  const bare = $derived(
    !$feed.loading && $feed.failure === undefined && $feed.items.length === 0,
  );

  onMount(() => void client.loadFeed());
</script>

<Register furled={rail.furled} onfurl={() => rail.toggle()}>
  {#if $feed.failure !== undefined}
    <Rail first>feed</Rail>
    <Body first>
      <span role="status" class="font-mono text-accent">{$feed.failure.said}</span>
    </Body>
  {/if}

  {#if bare}
    <Rail first>feed</Rail>
    <Body first>
      <Prose text="Nothing captured yet." />
    </Body>
  {/if}

  {#each $feed.items as item, at (item.id)}
    <FeedRow
      {item}
      first={at === 0 && $feed.failure === undefined}
      furled={rail.furled}
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
