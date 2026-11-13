<script lang="ts">
  import type { Action } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import { factOf, failed, namingIn } from "$lib/actions";
  import { client } from "$lib/client";
  import { kindWord } from "$lib/kinds";
  import { dayOf } from "$lib/stamp";

  import FactSaid from "./FactSaid.svelte";
  import Says from "./Says.svelte";

  /**
   * One entry of an opened batch, on a line inside the batch's row: when,
   * what kind, what it was about and the one fact the kind carries.
   */
  let { action, day }: { action: Action; day: string } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const fact = $derived(
    factOf(action.kind, action.detail, namingIn($templates, $destinations)),
  );
  const bad = $derived(failed(action.kind));
</script>

<div
  role="listitem"
  class="col-span-full grid grid-cols-subgrid items-baseline"
>
  <Stamp at={action.at} dated={dayOf(action.at) !== day} inline />
  <span class="tracking-caps uppercase {bad ? 'text-alarm' : ''}">
    {kindWord(action.kind)}
  </span>
  <span
    class="flex min-w-0 items-baseline justify-between gap-x-[3ch] max-narrow:flex-col max-narrow:items-stretch"
  >
    <span class="min-w-0 truncate">
      {#if action.subject !== undefined}
        <Says id={action.subject} href={itemHref(action.subject)} />
      {/if}
    </span>
    {#if fact !== undefined}
      <FactSaid {fact} />
    {/if}
  </span>
</div>
