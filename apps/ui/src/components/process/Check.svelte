<script lang="ts">
  import type { RoutingTemplate } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Facts from "$components/primitives/rows/Facts.svelte";
  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import { nameOf } from "$lib/destinations";

  import type { Decision } from "./decision.svelte";
  import Preview from "./Preview.svelte";
  import type { Previewing } from "./previewing.svelte";
  import StepHead from "./StepHead.svelte";
  import { NOTHING_PICKED, type Steps } from "./steps.svelte";

  /**
   * The decision read back before it is sent: its facts, the item's tags, and
   * what it would write, with the words this route carries to edit.
   */
  let {
    decision,
    steps,
    previewing,
    tags,
    templates,
    ontemplate,
    onedit,
  }: {
    decision: Decision;
    steps: Steps;
    previewing: Previewing;
    tags: readonly string[];
    /** The templates that have already decided the item. */
    templates: readonly string[];
    ontemplate: (template: RoutingTemplate) => void;
    onedit: () => void;
  } = $props();

  let typing = $state<HTMLTextAreaElement | undefined>(undefined);

  $effect(() => {
    if (decision.editing) typing?.focus();
  });
</script>

<section
  id="step-check"
  data-step="check"
  aria-label="check"
  class={steps.shows("check") ? "" : "hidden"}
>
  <StepHead name="check" phone={steps.onPhone} />
  {#if decision.chosen === undefined && !steps.onPhone}
    <p class="m-0 px-gutter py-3 text-muted">{NOTHING_PICKED}</p>
  {:else}
    <Facts facts={steps.facts} />
  {/if}

  <Band>tags</Band>
  <div class="px-gutter py-3">
    <ComposerTags
      item={decision.item.id}
      names={tags}
      {templates}
      {ontemplate}
    />
    <p class="mt-2 mb-0 text-small text-muted">
      The item's own tags: a change here is a change to the item.
    </p>
  </div>

  <Band>body</Band>
  <div class="px-gutter py-3">
    {#if previewing.shown !== undefined || previewing.pending}
      <Preview
        shown={previewing.shown}
        place={decision.previewPlace}
        attachments={decision.attachments}
        asking={previewing.pending}
        subject={decision.chosen === undefined
          ? undefined
          : nameOf(decision.chosen)}
      />
    {:else if previewing.failed !== ""}
      <p role="status" class="m-0 text-danger">{previewing.failed}</p>
    {:else}
      <p class="m-0 text-muted">
        {decision.chosen === undefined
          ? NOTHING_PICKED
          : "Shown once the place is settled."}
      </p>
    {/if}
    {#if decision.editing && !decision.assetsOnly}
      <textarea
        bind:this={typing}
        bind:value={decision.words}
        aria-label="words"
        rows="6"
        class="mt-3 w-full resize-y rounded-control border border-edge bg-paper px-3 py-2.5 outline-none focus:border-ink"
      ></textarea>
      <div class="mt-2 flex gap-2">
        <Box icon="undo" onclick={() => decision.keep()}>Restore</Box>
        <Box icon="check" onclick={() => decision.done()}>Use these words</Box>
      </div>
    {:else if !decision.assetsOnly}
      <div class="mt-2">
        <Box
          icon="edit"
          title="Edit the words this route carries"
          onclick={onedit}>Edit</Box
        >
      </div>
    {/if}
  </div>

  {#if decision.said !== ""}
    <p role="status" class="m-0 px-gutter py-3 text-danger">
      {decision.said}
    </p>
  {/if}
</section>
