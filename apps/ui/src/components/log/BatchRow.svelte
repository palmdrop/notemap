<script lang="ts">
  import type { Action } from "@notemap/client";

  import Asking from "$components/primitives/marks/Asking.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import { batchSaid, byKind, namesIn } from "$lib/batch-log";
  import { itemCount } from "$lib/batching";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { pickable } from "$lib/pick";
  import { dayOf } from "$lib/stamp";
  import { NOT_ALL_READ } from "$lib/said";

  import BatchEntry from "./BatchEntry.svelte";

  /**
   * A batch as one row of the log: what came of it, counted as its notice
   * counts it, opening to the entries it wrote.
   */
  let {
    id,
    at,
    entries,
  }: {
    id: string;
    at: string;
    entries: readonly Action[];
  } = $props();

  const templates = client.templates.all;
  const batches = client.batches;

  const whole = $derived(log.whole(id));
  /** Counted from what the walk holds, where the batch could not be read whole. */
  const said = $derived.by(() => {
    const counted = Array.isArray(whole) ? whole : entries;
    return (
      batchSaid(counted, $batches.get(id), namesIn($templates)) ??
      byKind(counted) ?? {
        what: itemCount(new Set(entries.map((one) => one.subject)).size),
      }
    );
  });
  const alarm = $derived(said.alarm === true);

  let opened = $state(false);

  function toggle(): void {
    opened = !opened;
    if (opened) log.opening(id);
  }
</script>

<div
  data-batch={id}
  class="col-span-full grid grid-cols-subgrid border-b border-rule"
>
  <Rail>
    <Stamp {at} dated={false} />
  </Rail>

  <Body>
    <span
      class="-mb-1.5 text-small tracking-caps uppercase {alarm
        ? 'text-danger'
        : 'text-muted'}">batch</span
    >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex cursor-pointer items-baseline justify-between gap-x-[3ch] max-wide:flex-col max-wide:items-stretch"
      onclick={pickable(toggle)}
    >
      <span class="min-w-0 truncate">
        <button
          type="button"
          aria-expanded={opened}
          onclick={toggle}
          class="text-left hover:underline"
        >
          {said.what}
          {#if said.subject !== undefined}
            <span class="font-semibold">{said.subject}</span>
          {/if}
        </button>
        {#if whole === "asking"}
          <Asking />
        {/if}
        {#if whole === "failed"}
          <span class="ml-[2ch]">{NOT_ALL_READ}</span>
        {/if}
      </span>

      {#if said.why !== undefined}
        <span class="shrink-0 {alarm ? 'text-danger' : ''}">{said.why}</span>
      {/if}
    </div>

    {#if opened}
      <div
        role="list"
        class="mt-2 grid grid-cols-[auto_auto_1fr] gap-x-[2ch] gap-y-1 pl-[2ch]"
      >
        {#each entries as action (action.id)}
          <BatchEntry {action} day={dayOf(at)} />
        {/each}
      </div>
    {/if}
  </Body>
</div>
