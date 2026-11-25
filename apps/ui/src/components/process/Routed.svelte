<script lang="ts">
  import { itemHref } from "$components/item/href";
  import Band from "$components/primitives/blocks/Band.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import Facts from "$components/primitives/rows/Facts.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import { templateFromHref } from "$components/settings/href";
  import { rise } from "$lib/motion";

  import type { Routed, Sending } from "./sending.svelte";

  /**
   * The route just made, drawn in the check's place: what it holds, where it
   * stands, and what to do next. Replaced by the next decision.
   */
  let {
    routed,
    sending,
    item,
    onagain,
  }: {
    routed: Routed;
    sending: Sending;
    item: string;
    onagain: () => void;
  } = $props();
</script>

<div in:rise>
  <Facts facts={routed.facts} />
  {#if sending.state !== undefined}
    {@const state = sending.state}
    <div
      role="status"
      class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule px-gutter py-3 {state.tone ===
      'good'
        ? 'bg-signal'
        : 'bg-tag'}"
    >
      <span class="text-small">state</span>
      <span
        class="flex min-w-0 items-center gap-2 {state.tone === 'danger'
          ? 'text-danger'
          : ''}"
      >
        {#if state.tone === "under"}<Spinner />{/if}
        {state.said}
      </span>
    </div>
  {/if}
  <Band>and then</Band>
  <LinkRow icon="route" title="Route it somewhere else too" onclick={onagain} />
  {#if sending.savable}
    <LinkRow
      icon="template"
      title="Save this as a template"
      href={templateFromHref(item, routed.record.id)}
    />
  {/if}
  <LinkRow icon="file" title="Open the item" href={itemHref(item)} />
</div>
