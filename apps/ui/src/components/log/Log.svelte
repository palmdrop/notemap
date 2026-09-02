<script lang="ts">
  import { untrack } from "svelte";

  import Body from "$components/primitives/register/Body.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { log } from "$lib/log.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { LOG_LEDE, NOTHING_LOGGED } from "$lib/said";

  import { logHref } from "./href";
  import Id from "./Id.svelte";
  import LogRow from "./LogRow.svelte";

  const pool = reachable();

  // A read that failed left nothing, and there is no cache to draw meanwhile.
  $effect(() => {
    if (pool.yes) untrack(() => log.again());
  });
</script>

<p class="mt-8 font-mono text-ink-muted">
  {LOG_LEDE}
  {#if log.item !== undefined}
    Only what is about <Id id={log.item} /> —
    <a href={logHref(log.order)} class="text-ink">show everything</a>
  {/if}
</p>

<div class="mt-6">
  <Register brief>
    {#if log.quiet}
      <Rail first>
        <div class="cleared"><StateWord word="quiet" inline /></div>
      </Rail>
      <Body first>
        <div class="cleared font-mono">{NOTHING_LOGGED}</div>
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
</div>
