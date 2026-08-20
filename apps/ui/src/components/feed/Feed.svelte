<script lang="ts">
  import { onMount } from "svelte";
  import type { Order } from "@notemap/client";

  import FeedRow from "$components/feed/FeedRow.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import OrderSelector from "$components/primitives/controls/OrderSelector.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Separator from "$components/primitives/register/Separator.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";

  const feed = client.feed;

  const bare = $derived(
    !$feed.loading && $feed.failure === undefined && $feed.items.length === 0,
  );

  onMount(() => void client.loadFeed());
</script>

<Register>
  <OrderSelector
    order={$feed.order}
    reading={$feed.loading}
    onchoose={(order: Order) => void client.loadFeed(order)}
  />

  {#if $feed.failure !== undefined}
    <Row>
      <Label name="feed" />
      <Content>
        <span role="status" class="font-mono text-accent">{$feed.failure}</span>
      </Content>
    </Row>
  {/if}

  {#if bare}
    <Row>
      <Label name="feed" />
      <Content>
        <Prose text="Nothing captured yet." />
      </Content>
    </Row>
  {/if}

  {#each $feed.items as item, at (item.id)}
    {#if at > 0}
      <Separator />
    {/if}
    <FeedRow {item} />
  {/each}

  {#if $feed.more}
    <Foot>
      <Action disabled={$feed.loading} onclick={() => void client.loadFeed()}>
        {$feed.loading ? "loading…" : "load more"}
      </Action>
    </Foot>
  {/if}
</Register>
