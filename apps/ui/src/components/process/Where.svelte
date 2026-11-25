<script lang="ts">
  import Band from "$components/primitives/blocks/Band.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Asks from "$components/primitives/rows/Asks.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import DestinationLine from "$components/routing/DestinationLine.svelte";
  import { nameOf } from "$lib/destinations";
  import { kindIcon, templateIcon, whereOf } from "$lib/looks";
  import { slide } from "$lib/motion";
  import { DISCARD, HAND, MANUAL } from "$lib/processing";

  import type { Choosing } from "./choosing.svelte";
  import type { Decision } from "./decision.svelte";
  import StepHead from "./StepHead.svelte";
  import type { Steps } from "./steps.svelte";

  /**
   * Where the route goes: the line and the three bands, or, once one is
   * taken, its row with Change.
   */
  let {
    decision,
    steps,
    choosing,
    onrelease,
  }: {
    decision: Decision;
    steps: Steps;
    choosing: Choosing;
    onrelease: () => void;
  } = $props();
</script>

<section
  id="step-where"
  data-step="where"
  aria-label="where"
  class={steps.shows("where") ? "" : "hidden"}
>
  <StepHead name="where" phone={steps.onPhone} />
  {#if decision.chosen === undefined && decision.applied === undefined}
    <div class="border-b border-rule px-gutter py-3">
      <DestinationLine
        destinations={[
          ...choosing.templates,
          ...choosing.offeredDestinations,
          ...HAND,
        ]}
        unusable={choosing.unusable}
        focus={!steps.onPhone}
        ontake={(id) => void choosing.taken(id)}
        ontyped={(text) => (decision.typed = text)}
      />
    </div>

    <div id="destination-bands">
      {#if choosing.templatesShown.length > 0}
        <Band>templates</Band>
        {#each choosing.templatesShown as one (one.id)}
          <LinkRow
            icon={templateIcon(one, choosing.kindOf(one.destination))}
            title={one.name}
            label={one.name}
            line={whereOf(one)}
            why={choosing.unusable[one.id]}
            strong={choosing.hit === one.id}
            onclick={() => void choosing.take(one)}
          >
            {#snippet badge()}
              {#if Object.keys(one.asked ?? {}).length > 0}<Asks />{/if}
            {/snippet}
          </LinkRow>
        {/each}
      {/if}

      {#if choosing.destinationsShown.length > 0}
        <Band>destinations</Band>
        {#each choosing.destinationsShown as one (one.id)}
          <LinkRow
            icon={kindIcon(one.kind)}
            title={one.name}
            label={one.name}
            why={choosing.unusable[one.id]}
            strong={choosing.hit === one.id}
            onclick={() => void choosing.choose(one.id)}
          />
        {/each}
      {/if}

      <!-- What the shell invents: `manual` is a destination the pool records
           and never lists, `discard` is not a destination at all. -->
      {#if choosing.handShown.length > 0 && steps.onPhone}
        <Band>other</Band>
        {#each choosing.handShown as one (one.id)}
          <LinkRow
            icon={one.id === DISCARD ? "trash" : "check"}
            title={one.id === DISCARD ? "Discard" : "Manual"}
            label={one.id === DISCARD ? "Discard" : "Manual"}
            line={one.id === MANUAL ? "Processed by hand" : undefined}
            danger={one.id === DISCARD}
            chevron={false}
            why={choosing.unusable[one.id]}
            strong={choosing.hit === one.id}
            onclick={() => void choosing.choose(one.id)}
          />
        {/each}
      {/if}
    </div>
  {:else}
    {@const template = decision.applied}
    {@const usedBefore = decision.usedBefore}
    <div
      in:slide
      class="grid min-h-bar grid-cols-[var(--spacing-icon)_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-gutter py-2.5"
    >
      <Icon
        name={template === undefined
          ? kindIcon(choosing.kindOf(decision.chosen))
          : templateIcon(template, choosing.kindOf(template.destination))}
      />
      <span class="min-w-0">
        <span class="block font-semibold">
          {template?.name ??
            (decision.chosen === undefined ? "" : nameOf(decision.chosen))}
        </span>
        <small class="block truncate text-small text-muted">
          {#if template !== undefined}
            template: {whereOf(template)}
          {:else}
            destination{#if usedBefore !== undefined},
              {usedBefore.lead}{#if usedBefore.rest !== undefined},
                {usedBefore.rest}{/if}{/if}
          {/if}
        </small>
      </span>
      <button
        type="button"
        aria-label="change"
        onclick={onrelease}
        class="min-h-target px-1 underline underline-offset-[0.2em]"
      >
        Change
      </button>
    </div>
    {#if decision.chosen === undefined}
      <div class="px-gutter py-3"><Asking /></div>
    {/if}
  {/if}
</section>
