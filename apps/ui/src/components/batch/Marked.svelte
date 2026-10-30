<script lang="ts">
  import type { BatchAction, RoutingTemplate } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { notes } from "$lib/batching";

  /**
   * What the rows marked for a batch can be given, held in the list's head
   * while any are marked: a template whose trigger tag files them all, or a
   * discard. `all` marks every row the surface holds, `clear` leaves the mode.
   */
  let {
    count,
    templates,
    onbatch,
    onall,
    onclear,
  }: {
    count: number;
    /** The templates a tag can apply: the only ones a batch can. */
    templates: readonly RoutingTemplate[];
    onbatch: (action: BatchAction) => void;
    onall: () => void;
    onclear: () => void;
  } = $props();

  let choosing = $state(false);
</script>

<span class="whitespace-nowrap">{notes(count)} marked</span>

{#if choosing}
  <span class="flex flex-wrap items-baseline gap-x-[2ch]">
    <span>route with</span>
    {#each templates as template (template.id)}
      <Action
        primary
        onclick={() => {
          choosing = false;
          onbatch({ kind: "template", template: template.id });
        }}>{template.name}</Action
      >
    {/each}
    <Action onclick={() => (choosing = false)}>back</Action>
  </span>
{:else}
  {#if templates.length > 0}
    <Action primary disabled={count === 0} onclick={() => (choosing = true)}
      >route</Action
    >
  {/if}
  <Action
    alarm
    disabled={count === 0}
    onclick={() => onbatch({ kind: "archive" })}>discard</Action
  >
  <Action onclick={onall}>all</Action>
  <Action onclick={onclear}>clear</Action>
{/if}
