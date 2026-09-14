<script lang="ts">
  import { onMount, tick } from "svelte";

  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import Row from "$components/item/Row.svelte";
  import Order from "$components/order/Order.svelte";
  import Index from "$components/queue/Index.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Refused from "$components/primitives/register/Refused.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import ViewToggle from "$components/view/ViewToggle.svelte";
  import { processHref } from "$components/item/href";
  import { client } from "$lib/client";
  import { orderFor } from "$lib/order";
  import { pending } from "$lib/pending.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { refusalIn } from "$lib/refusal";
  import { keepPlace, restorePlace } from "$lib/scroll-mark";
  import { NOTHING_CAPTURED } from "$lib/said";
  import { remember, viewFor, withView, type View } from "$lib/view";

  const SURFACE = "feed";

  const feed = client.feed;
  const pool = reachable();
  const undrained = pending();

  /** One row is selected at a time, as on the queue: it is the same row. */
  let selected = $state<string | undefined>(undefined);
  let view = $state<View>(viewFor(SURFACE, page.url));

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

  function select(id: string) {
    selected = selected === id ? undefined : id;
  }

  function read(wanted: View) {
    view = wanted;
    remember(SURFACE, wanted);
    replaceState(withView(page.url, wanted), {});
  }
</script>

<Head>
  <ViewToggle {view} onchoose={read} />
  <Order />
</Head>

{#if view === "index" && !bare}
  {#if refused !== undefined}
    <Register><Refused surface="feed" {refused} /></Register>
  {/if}

  <Index
    items={$feed.items}
    {selected}
    onselect={select}
    onprocess={(id) => void goto(processHref(id))}
  />

  {#if $feed.more}
    <More
      loading={$feed.loading}
      offline={!pool.yes}
      onmore={() => void client.loadFeed()}
    />
  {/if}
{:else}
  <Register>
    {#if refused !== undefined}
      <Refused surface="feed" {refused} />
    {/if}

    {#if bare}
      <Rail>feed</Rail>
      <Body>
        <Prose text={NOTHING_CAPTURED} />
      </Body>
    {/if}

    {#each $feed.items as item (item.id)}
      <Row
        {item}
        surface="feed"
        selected={selected === item.id}
        offline={!pool.yes}
        pending={undrained.has(item.id)}
        onselect={() => select(item.id)}
        onprocess={() => void goto(processHref(item.id))}
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
{/if}
