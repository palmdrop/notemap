<script lang="ts">
  import { tick } from "svelte";

  import {
    FILTER_STATES,
    filterSize,
    type Filter,
    type SourceUse,
  } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import Walked from "$components/primitives/composer/Walked.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import Order from "$components/order/Order.svelte";
  import ViewChooser from "$components/view/ViewChooser.svelte";
  import type { View } from "$lib/view";
  import { client } from "$lib/client";
  import { narrowed } from "$lib/candidate-list";
  import type { FilterKind } from "$lib/filter";
  import { STATE_WORD } from "$lib/said";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * What a surface is read through, taken into the filter and out of it again
   * from one panel: on the feed, bands of states, destinations and sources
   * above the tags; on the queue, sources and tags. A tag this surface holds
   * none of is not offered, unless it is already in the filter.
   */
  let {
    surface,
    filter,
    view,
    onview,
    ontoggle,
    onclear,
    shown,
  }: {
    surface: "queue" | "feed";
    filter: Filter;
    /** Rows or the index, chosen here. */
    view?: View;
    onview?: (view: View) => void;
    ontoggle: (kind: FilterKind, value: string) => void;
    onclear: () => void;
    /** How many rows the surface draws through the filter, for Show to say. */
    shown?: number;
  } = $props();

  const id = $props.id();
  const TRIGGER = "inline-flex items-center gap-1";
  /** An option drawn as a box that can be on, beside the others. */
  const BOX =
    "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border px-3.5";
  const boxed = (on: boolean): string =>
    `${BOX} ${on ? "border-ink bg-ink pl-2.5 text-paper" : "border-off-line bg-off text-ink"}`;

  const inUse = client.tags.inUse;
  const templates = client.templates.all;
  const destinations = client.destinations.all;

  let sources = $state<readonly SourceUse[]>([]);

  type BandLine = {
    readonly value: string;
    readonly said: string;
    readonly count?: number;
  };

  type Band = {
    readonly kind: FilterKind;
    readonly label: string;
    readonly lines: readonly BandLine[];
  };

  /** A value in the filter that the band no longer offers stays, so it can be taken off. */
  function withHeld(
    lines: readonly BandLine[],
    held: readonly string[],
  ): readonly BandLine[] {
    const unoffered = held
      .filter((value) => !lines.some((line) => line.value === value))
      .map((value) => ({ value, said: value }));
    return [...lines, ...unoffered];
  }

  const bands = $derived.by((): readonly Band[] => {
    const state: Band = {
      kind: "states",
      label: "State",
      lines: FILTER_STATES.map((value) => ({
        value,
        said: STATE_WORD[value],
      })),
    };
    const live = $destinations.filter((one) => one.retired !== true);
    const retired = $destinations.filter((one) => one.retired === true);
    const destination: Band = {
      kind: "destinations",
      label: "Destination",
      lines: withHeld(
        [
          ...live.map((one) => ({ value: one.id, said: one.name })),
          ...retired.map((one) => ({ value: one.id, said: one.name })),
        ],
        filter.destinations,
      ),
    };
    const source: Band = {
      kind: "sources",
      label: "Source",
      lines: withHeld(
        sources.map((one) => ({
          value: one.id,
          said: one.id,
          count: surface === "queue" ? one.unprocessed : one.items,
        })),
        filter.sources,
      ),
    };
    return (
      surface === "feed" ? [state, destination, source] : [source]
    ).filter((band) => band.lines.length > 0);
  });

  const size = $derived(filterSize(filter));

  let open = $state(false);
  let draft = $state("");
  let at = $state<number | undefined>(undefined);
  let line = $state<HTMLInputElement | undefined>(undefined);
  let rows = $state<Record<string, HTMLElement | undefined>>({});

  type Line = {
    readonly name: string;
    readonly count: number;
    readonly template: string | undefined;
  };

  const lines = $derived.by((): readonly Line[] => {
    const counted = $inUse.map((use) => ({
      name: use.name,
      count: surface === "queue" ? use.unprocessed : use.items,
    }));
    const unheld = filter.tags
      .filter((tag) => !counted.some((use) => use.name === tag))
      .map((name) => ({ name, count: 0 }));

    // On the queue every template's trigger is offered, held or not: a
    // trigger tag files what carries it, so the queue rarely holds one.
    const triggers =
      surface === "queue"
        ? $templates
            .map((one) => one.triggerTag)
            .filter(
              (tag): tag is string =>
                tag !== undefined &&
                !counted.some((use) => use.name === tag) &&
                !unheld.some((use) => use.name === tag),
            )
            .map((name) => ({ name, count: 0 }))
        : [];

    return [...counted, ...unheld, ...triggers]
      .map((use) => ({ ...use, template: triggeredBy(use.name)?.name }))
      .filter(
        (use) =>
          use.count > 0 ||
          filter.tags.includes(use.name) ||
          (surface === "queue" && use.template !== undefined),
      );
  });

  const matched = $derived.by(() => {
    const kept = new Set(
      narrowed(
        lines.map((one) => ({ label: one.name, value: one.name })),
        draft,
      ).map((entry) => entry.label),
    );
    return lines.filter((one) => kept.has(one.name));
  });

  const ordinary = $derived(
    matched.filter((one) => one.template === undefined),
  );
  const triggers = $derived(
    matched.filter((one) => one.template !== undefined),
  );

  /** Walked in the order drawn, which puts the trigger band last. */
  const walked = $derived([...ordinary, ...triggers].map((one) => one.name));

  $effect(() => {
    void draft;
    at = draft.trim() === "" ? undefined : 0;
  });

  const marked = $derived(at === undefined ? undefined : walked[at]);

  /** Opens the panel with the line taking what is typed, for a key that asks for it. */
  export async function show(): Promise<void> {
    open = true;
    // Counts go stale as items are processed here and elsewhere; the held set
    // stands where the pool does not answer.
    void client.tags.load().catch(() => undefined);
    void client.sources
      .inUse()
      .then((read) => (sources = read))
      .catch(() => undefined);
    await tick();
    line?.focus({ preventScroll: true });
  }

  function shut(): void {
    open = false;
    draft = "";
    at = undefined;
  }

  function walk(step: 1 | -1): void {
    if (walked.length === 0) return;
    at =
      at === undefined
        ? step === 1
          ? 0
          : walked.length - 1
        : (at + step + walked.length) % walked.length;
    const name = walked[at];
    if (name !== undefined) rows[name]?.scrollIntoView({ block: "nearest" });
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      walk(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (marked !== undefined) ontoggle("tags", marked);
    }
  }

  function said(one: Line): string {
    return one.template !== undefined && one.name.startsWith(TRIGGER_NAMESPACE)
      ? one.name.slice(TRIGGER_NAMESPACE.length)
      : one.name;
  }
</script>

{#snippet row(one: Line)}
  {@const index = walked.indexOf(one.name)}
  {@const taken = filter.tags.includes(one.name)}
  <div bind:this={rows[one.name]} data-tag={one.name} role="none">
    <Walked
      id={marked === one.name ? `${id}-tag-${index}` : undefined}
      on={marked === one.name}
      selected={taken}
      onhover={() => (at = index)}
      ontake={() => ontoggle("tags", one.name)}
    >
      <span class={boxed(taken)}>
        {#if taken}<Icon name="check" class="size-4" />{/if}
        <span class={one.template === undefined ? "" : TRIGGER}>
          {#if one.template === undefined}<span aria-hidden="true">#</span
            >{:else}<Icon name="route" class="size-4" />{/if}<span
            >{said(one)}</span
          >
        </span>
        <span class="tabular-nums opacity-70">{one.count}</span>
      </span>
    </Walked>
  </div>
{/snippet}

{#snippet part(label: string)}
  <h3 class="mb-2">{label}</h3>
{/snippet}

{#if open}
  <Sheet title="filter" onclose={shut}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      id="{id}-panel"
      onkeydown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        event.preventDefault();
        shut();
      }}
    >
      <section class="border-b border-rule px-gutter pt-3 pb-4">
        {@render part("Order")}
        <Order />
      </section>
      {#if view !== undefined && onview !== undefined}
        <section class="border-b border-rule px-gutter pt-3 pb-4">
          {@render part("View")}
          <ViewChooser {view} onchoose={onview} />
        </section>
      {/if}
      {#each bands as band (band.kind)}
        <section class="border-b border-rule px-gutter pt-3 pb-4">
          {@render part(band.label)}
          <div
            role="listbox"
            aria-label={band.label}
            aria-multiselectable="true"
            class="flex flex-wrap gap-1.5"
          >
            {#each band.lines as one (one.value)}
              {@const taken = (filter[band.kind] as readonly string[]).includes(
                one.value,
              )}
              <div data-filter={band.kind} role="none">
                <Walked
                  selected={taken}
                  ontake={() => ontoggle(band.kind, one.value)}
                >
                  <span class={boxed(taken)}>
                    {#if taken}<Icon name="check" class="size-4" />{/if}
                    <span>{one.said}</span>
                    {#if one.count !== undefined}
                      <span class="tabular-nums opacity-70">{one.count}</span>
                    {/if}
                  </span>
                </Walked>
              </div>
            {/each}
          </div>
        </section>
      {/each}
      <section class="px-gutter pt-3 pb-4">
        {@render part("Tags")}
        <input
          bind:this={line}
          bind:value={draft}
          {onkeydown}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Find a tag"
          placeholder="Find a tag"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="{id}-tags"
          aria-activedescendant={marked === undefined
            ? undefined
            : `${id}-tag-${at}`}
          class="mb-2 w-full border-b border-rule bg-transparent py-1 outline-none"
        />
        {#if walked.length === 0}
          <p class="text-muted">
            {lines.length === 0 ? "No tags." : "No tag matches."}
          </p>
        {/if}
        <div
          id="{id}-tags"
          role="listbox"
          aria-label="Tags"
          aria-multiselectable="true"
          class="flex flex-wrap gap-1.5"
        >
          {#each ordinary as one (one.name)}
            {@render row(one)}
          {/each}
        </div>
        {#if triggers.length > 0}
          <div class="mt-4">
            {@render part("Templates")}
            <div
              role="listbox"
              aria-label="Templates"
              aria-multiselectable="true"
              class="flex flex-wrap gap-1.5"
            >
              {#each triggers as one (one.name)}
                {@render row(one)}
              {/each}
            </div>
          </div>
        {/if}
      </section>
    </div>
    {#snippet foot()}
      <ActionBar at="foot" label="Filter">
        <BarAction
          icon="undo"
          label="Reset"
          disabled={size === 0}
          onclick={() => {
            line?.focus();
            onclear();
          }}
        />
        <BarAction
          icon="check"
          label={shown === undefined ? "Show" : `Show ${String(shown)}`}
          primary
          onclick={shut}
        />
      </ActionBar>
    {/snippet}
  </Sheet>
{/if}
