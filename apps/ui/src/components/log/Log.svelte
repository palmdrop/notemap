<script lang="ts">
  import { onMount, tick, untrack } from "svelte";

  import type { Action } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import More from "$components/primitives/register/More.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { batchSaid } from "$lib/batch-log";
  import { wordsFor } from "$lib/batching";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { duration } from "$lib/motion";
  import { reachable } from "$lib/reachable.svelte";
  import { NOTHING_LOGGED } from "$lib/said";

  import BatchRow from "./BatchRow.svelte";
  import { grouped } from "./groups";
  import { logHref } from "./href";
  import Says from "./Says.svelte";
  import LogRow from "./LogRow.svelte";
  import OutcomeRow from "./OutcomeRow.svelte";
  import Views from "./Views.svelte";

  const pool = reachable();

  /**
   * What is drawn. A reading turned to another holds the last one while it
   * fades out, rather than emptying for the frame a quick answer takes; the
   * answer then fades in. One slower than the fade finds the log emptied and
   * asking, as a read always did. Rows held from before this surface was drawn
   * are not held: they belong to a reading nobody is looking at.
   */
  let drawn = $state.raw<readonly Action[]>(untrack(() => log.rows));
  let dim = $state(false);
  let fading: ReturnType<typeof setTimeout> | undefined;
  let entered = false;

  onMount(() => {
    void tick().then(() => (entered = true));
  });

  $effect(() => {
    const now = log.rows;
    const turning = log.turning;
    untrack(() => {
      if (fading !== undefined) return;
      if (!turning) {
        drawn = now;
        return;
      }
      if (!entered) {
        drawn = [];
        return;
      }
      if (drawn.length === 0) return;
      dim = true;
      fading = setTimeout(() => {
        fading = undefined;
        drawn = log.turning ? [] : log.rows;
        dim = false;
      }, duration("short"));
    });
  });

  $effect(() => () => clearTimeout(fading));

  const HALF_A_DAY = 12 * 60 * 60 * 1000;

  const whole = (id: string) => {
    const held = log.whole(id);
    return Array.isArray(held) ? held : undefined;
  };

  const groups = $derived(
    grouped(drawn, {
      order: log.order,
      grouping: log.grouping,
      kinds: log.kinds,
      whole,
    }),
  );

  /** A gap opens where more than half a day passed before a row, in reading order. */
  const rows = $derived(
    groups.map((row, index) => {
      const at = (one: (typeof groups)[number]) =>
        Date.parse(one.kind === "action" ? one.action.at : one.at);
      const before = groups[index - 1];
      return {
        row,
        key: row.kind === "action" ? row.action.id : `batch:${row.id}`,
        gap:
          before !== undefined && Math.abs(at(row) - at(before)) > HALF_A_DAY,
      };
    }),
  );

  const templates = client.templates.all;
  const batches = client.batches;

  /** The batch the log is narrowed to, as this client made it, where it still holds the answer. */
  const made = $derived(
    log.batch === undefined ? undefined : $batches.get(log.batch),
  );

  const said = $derived.by(() => {
    if (log.batch === undefined) return undefined;
    const entries = whole(log.batch);
    return entries === undefined
      ? undefined
      : batchSaid(
          entries,
          made,
          (template) => $templates.find((one) => one.id === template)?.name,
        );
  });

  /** What the pool wrote nothing for: the items the batch refused, and those it left as they were. */
  const unlogged = $derived.by(() => {
    if (made?.outcomes === undefined) return [];
    const routing = made.outcomes.some((one) => one.outcome === "reserved");
    const left = wordsFor(made.action, routing).already;
    return made.outcomes.flatMap((one) =>
      one.outcome === "refused"
        ? [{ id: one.id, word: "refused", fact: one.error.code, alarm: true }]
        : one.outcome === "skipped"
          ? [{ id: one.id, word: "skipped", fact: left, alarm: false }]
          : [],
    );
  });

  // A read that failed left nothing, and there is no cache to draw meanwhile.
  $effect(() => {
    if (pool.yes) untrack(() => log.again());
  });

  // The watcher is already asking on the shell's own tempo for the status line to
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
    <a href={logHref(log.order, undefined, log.kinds)} class="ml-[2ch]"
      >all of the log</a
    >
  </p>
{/if}

{#if log.batch !== undefined}
  <!-- The log narrowed to one batch, said above the head as history is. -->
  <p class="pt-5">
    <span class="font-semibold tracking-caps uppercase">batch</span>
    {#if said === undefined}
      <Asking />
    {:else}
      <span class={said.alarm === true ? "text-alarm" : ""}>
        {said.what}
        {#if said.subject !== undefined}
          <span class="font-semibold">{said.subject}</span>
        {/if}
        {#if said.why !== undefined}
          <span class="ml-[2ch]">{said.why}</span>
        {/if}
      </span>
    {/if}
    <a href={logHref(log.order, undefined, log.kinds)} class="ml-[2ch]"
      >all of the log</a
    >
  </p>
{/if}

<Views />

<div
  class="transition-opacity duration-(--duration-short) ease-fade {dim
    ? 'opacity-0'
    : ''}"
>
  <Register>
    {#if log.quiet && drawn.length === 0}
      <Rail>
        <div class="cleared"><StateWord word="quiet" inline /></div>
      </Rail>
      <Body>
        <div class="cleared">{NOTHING_LOGGED}</div>
      </Body>
    {/if}

    {#each unlogged as one (one.id)}
      <OutcomeRow
        subject={one.id}
        word={one.word}
        fact={one.fact}
        alarm={one.alarm}
      />
    {/each}

    {#each rows as { row, key, gap } (key)}
      {#if row.kind === "action"}
        <LogRow action={row.action} {gap} heard={log.heard(row.action.id)} />
      {:else}
        <BatchRow id={row.id} at={row.at} entries={row.entries} {gap} />
      {/if}
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
</div>
