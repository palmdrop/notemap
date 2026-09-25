<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { moving } from "$lib/moving.svelte";
  import { reachable } from "$lib/reachable.svelte";
  import { NOTHING_LOGGED } from "$lib/said";

  import { logHref } from "./href";
  import Says from "./Says.svelte";
  import LogRow from "./LogRow.svelte";
  import Views from "./Views.svelte";

  const pool = reachable();
  const motion = moving(
    () => log.loading,
    () => log.rows.length,
  );

  const HALF_A_DAY = 12 * 60 * 60 * 1000;

  /** A gap opens where more than half a day passed before a row, in reading order. */
  const rows = $derived(
    log.rows.map((action, at) => {
      const before = log.rows[at - 1];
      return {
        action,
        gap:
          before !== undefined &&
          Math.abs(Date.parse(action.at) - Date.parse(before.at)) > HALF_A_DAY,
      };
    }),
  );

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

{#if log.item !== undefined}
  <!-- History: the log narrowed to one item, said above the head. -->
  <p class="pt-5">
    <span class="font-semibold tracking-caps uppercase">history</span>
    <Says id={log.item} href={itemHref(log.item)} />
    · <a href={logHref(log.order, undefined, log.kinds)}>all of the log</a>
  </p>
{/if}

<Views />

<Register>
  {#if log.quiet}
    <Rail>
      <div class="cleared"><StateWord word="quiet" inline /></div>
    </Rail>
    <Body>
      <div class="cleared">{NOTHING_LOGGED}</div>
    </Body>
  {/if}

  {#each rows as row (row.action.id)}
    <LogRow action={row.action} gap={row.gap} {motion} />
  {/each}

  {#if log.more || (log.loading && rows.length === 0)}
    <More
      loading={log.loading}
      first={rows.length === 0}
      offline={!pool.yes}
      failed={log.failed}
      onmore={() => {
        log.next();
      }}
    />
  {/if}
</Register>
