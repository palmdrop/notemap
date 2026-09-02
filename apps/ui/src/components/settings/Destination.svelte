<script lang="ts">
  import type { Destination, DestinationDescription } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { pickable } from "$lib/pick";

  let {
    one,
    described,
    asking,
    opened,
    offline,
    onopen,
    oncheck,
    onedit,
    onretire,
    ondelete,
    children,
  }: {
    one: Destination;
    described?: DestinationDescription;
    /** Being asked now, which is the ordinary state of a row that has just been drawn. */
    asking: boolean;
    opened: boolean;
    offline: boolean;
    onopen: () => void;
    oncheck: () => void;
    onedit: () => void;
    onretire: () => void;
    ondelete: () => void;
    children?: import("svelte").Snippet;
  } = $props();

  const retired = $derived(one.retired === true);

  const can = $derived(
    described === undefined
      ? undefined
      : described.kind === "described"
        ? described.capabilities.map((each) => each.name).join(", ")
        : undefined,
  );

  const refusing = $derived(
    described === undefined || described.kind === "described"
      ? undefined
      : `${described.kind} — ${described.detail}`,
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="border-b border-b-ink/20 py-4" onclick={pickable(onopen)}>
  <div class="flex cursor-pointer flex-wrap items-baseline gap-x-3">
    <span
      aria-hidden="true"
      class="w-[1ch] flex-none {retired ? 'text-ink-muted' : ''}"
    >
      {retired ? "○" : "●"}
    </span>
    <button
      type="button"
      onclick={onopen}
      aria-expanded={opened}
      class="tracking-wider uppercase hover:text-accent {retired
        ? 'text-ink-muted'
        : ''}"
    >
      {one.name}
    </button>
    <span class="text-ink-muted">{one.kind}</span>

    <span
      class="ml-auto whitespace-nowrap max-narrow:ml-[var(--spacing-mark)] max-narrow:w-full
        {refusing !== undefined
        ? 'text-accent'
        : can !== undefined
          ? 'text-good'
          : 'text-ink-muted'}"
    >
      {#if refusing !== undefined}
        ⚠ {refusing}
      {:else if can !== undefined}
        ✓ answered
      {:else if asking}
        ↻ asking
      {:else if retired}
        retired · offered to nothing new
      {:else}
        not asked yet
      {/if}
    </span>
  </div>

  {#if opened}
    <div class="mt-4 pl-[var(--spacing-mark)]">
      <Fact name="can" empty={can === undefined}>
        {#if can !== undefined}
          {can}
        {:else if asking}
          asking now
        {:else if retired}
          not offered, so not asked
        {:else}
          unasked — describing one is a read that can hang
        {/if}
      </Fact>
      <!-- On the open row rather than the collapsed one: a kind may want a
           token here, and a scannable list is the wrong place for it. -->
      {#each Object.entries(one.settings ?? {}) as [key, value] (key)}
        <Fact name={key}>{String(value)}</Fact>
      {/each}

      <Fact name="id">{one.id}</Fact>

      <div
        class="mt-4 flex flex-wrap items-baseline gap-x-6 border-t border-t-ink/20 pt-3"
      >
        <Action disabled={asking} onclick={oncheck}>
          <span aria-hidden="true" class="text-ink-muted">↻</span>
          {can === undefined && refusing === undefined
            ? "Check"
            : "Check again"}
        </Action>
        <Action disabled={offline} onclick={onedit}>
          <span aria-hidden="true" class="text-ink-muted">✎</span> Edit
        </Action>
        <Action disabled={offline} onclick={onretire}>
          <span aria-hidden="true" class="text-ink-muted">
            {retired ? "●" : "○"}
          </span>
          {retired ? "Offer again" : "Retire"}
        </Action>
        <span class="ml-auto max-narrow:ml-0">
          <Action disabled={offline} onclick={ondelete}>
            <span class="text-accent">
              <span aria-hidden="true">×</span> Delete
            </span>
          </Action>
        </span>
      </div>

      {@render children?.()}
    </div>
  {/if}
</div>
