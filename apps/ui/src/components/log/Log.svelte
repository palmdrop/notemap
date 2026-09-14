<script lang="ts">
  import { onMount, untrack } from "svelte";

  import Order from "$components/order/Order.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Head from "$components/primitives/register/Head.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { LOG_LEDE, NOTHING_LOGGED } from "$lib/said";

  import { logHref } from "./href";
  import Says from "./Says.svelte";
  import LogRow from "./LogRow.svelte";
  import Shown from "./Shown.svelte";
  import Views from "./Views.svelte";

  const pool = reachable();

  // A read that failed left nothing, and there is no cache to draw meanwhile.
  $effect(() => {
    if (pool.yes) untrack(() => log.again());
  });

  // The watcher is already asking on the shell's own tempo for the corner to
  // speak from. A log that did not listen to it was the one surface where
  // reading meant reloading.
  onMount(() => {
    const held = client.actions.watch().subscribe((since) => {
      // More happened than a page holds, so what arrived is not what is
      // missing: the whole reading is stale and asking again is the only
      // honest answer.
      if (since.more) log.raced();
      else log.arrived(since.actions);
    });

    return () => held.unsubscribe();
  });
</script>

<p class="mt-8">
  {LOG_LEDE}
  {#if log.item !== undefined}
    Only what is about <Says id={log.item} /> —
    <a href={logHref(log.order, undefined, log.kinds)}>show everything</a>
  {/if}
</p>

<Views />

<Head>
  <Shown />
  <span class="ml-auto"><Order /></span>
</Head>

<Register>
  {#if log.quiet}
    <Rail first>
      <div class="cleared"><StateWord word="quiet" inline /></div>
    </Rail>
    <Body first>
      <div class="cleared">{NOTHING_LOGGED}</div>
    </Body>
  {/if}

  {#each log.rows as action, at (action.id)}
    <LogRow {action} order={log.order} first={at === 0} />
  {/each}

  {#if log.more}
    <More
      loading={log.loading}
      offline={!pool.yes}
      onmore={() => {
        log.next();
      }}
    />
  {/if}
</Register>
