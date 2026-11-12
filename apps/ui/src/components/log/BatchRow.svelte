<script lang="ts">
  import type { Action } from "@notemap/client";

  import Asking from "$components/primitives/marks/Asking.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import { batchSaid } from "$lib/batch-log";
  import { notes } from "$lib/batching";
  import { client } from "$lib/client";
  import { log } from "$lib/log.svelte";
  import { pickable } from "$lib/pick";

  import LogRow from "./LogRow.svelte";

  /**
   * A batch as one row of the log: what came of it, counted as its notice
   * counts it, opening to the entries it wrote.
   */
  let {
    id,
    at,
    entries,
    gap = false,
  }: {
    id: string;
    at: string;
    entries: readonly Action[];
    gap?: boolean;
  } = $props();

  const templates = client.templates.all;
  const batches = client.batches;

  const whole = $derived(log.whole(id));
  const said = $derived(
    batchSaid(
      Array.isArray(whole) ? whole : entries,
      $batches.get(id),
      (template) => $templates.find((one) => one.id === template)?.name,
    ) ?? {
      what: notes(new Set(entries.map((one) => one.subject)).size),
    },
  );
  const alarm = $derived(said.alarm === true);

  let opened = $state(false);
</script>

<div class="col-span-full grid grid-cols-subgrid">
  <Rail {gap}>
    <Stamp {at} />
    <div class="mt-2 tracking-caps uppercase {alarm ? 'text-alarm' : ''}">
      batch
    </div>
  </Rail>

  <Body {gap}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex cursor-pointer items-baseline justify-between gap-x-[3ch] max-narrow:flex-col max-narrow:items-stretch"
      onclick={pickable(() => (opened = !opened))}
    >
      <span class="min-w-0 truncate">
        <button
          type="button"
          aria-expanded={opened}
          onclick={() => (opened = !opened)}
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
      </span>

      {#if said.why !== undefined}
        <span class="shrink-0 {alarm ? 'text-alarm' : ''}">{said.why}</span>
      {/if}
    </div>
  </Body>
</div>

{#if opened}
  {#each entries as action (action.id)}
    <LogRow {action} />
  {/each}
{/if}
