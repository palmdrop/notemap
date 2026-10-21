<script lang="ts">
  import { tick } from "svelte";

  import {
    FILTER_STATES,
    filterSize,
    type Filter,
    type SourceUse,
  } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
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
    ontoggle,
    onclear,
  }: {
    surface: "queue" | "feed";
    filter: Filter;
    ontoggle: (kind: FilterKind, value: string) => void;
    onclear: () => void;
  } = $props();

  const id = $props.id();
  const TRIGGER =
    "font-semibold [font-variant-caps:all-small-caps] tracking-[0.04em]";

  const inUse = client.tags.inUse;
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
      label: "state",
      lines: FILTER_STATES.map((value) => ({
        value,
        said: STATE_WORD[value],
      })),
    };
    const live = $destinations.filter((one) => one.retired !== true);
    const retired = $destinations.filter((one) => one.retired === true);
    const destination: Band = {
      kind: "destinations",
      label: "destination",
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
      label: "source",
      lines: withHeld(
        sources.map((one) => ({
          value: one.id,
          said: one.id,
          count: one.items,
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

    return [...counted, ...unheld]
      .filter((use) => use.count > 0 || filter.tags.includes(use.name))
      .map((use) => ({ ...use, template: triggeredBy(use.name)?.name }));
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
    line?.focus();
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
      <span class="flex items-baseline gap-2.5">
        <span aria-hidden="true" class="w-[1ch] flex-none">
          {taken ? "▸" : ""}
        </span>
        <span class={one.template === undefined ? "" : TRIGGER}>
          {said(one)}
        </span>
        {#if one.template !== undefined}
          <span class="max-narrow:hidden">→ {one.template}</span>
        {/if}
        <span class="ml-auto pl-4 tabular-nums">{one.count}</span>
      </span>
    </Walked>
  </div>
{/snippet}

<!-- Leaving the control is what shuts it, whichever way a person leaves. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative"
  onfocusout={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      shut();
    }
  }}
  onkeydown={(event) => {
    if (event.key !== "Escape" || !open) return;
    // Shutting this is what the key did here, so nothing above it — a
    // selection let go of — also acts on the one press.
    event.stopPropagation();
    event.preventDefault();
    shut();
  }}
>
  <!-- Not taken on `mousedown` while open: a browser that gives a pressed
       button no focus would shut the panel as the line lost it, and the click
       would open it again. -->
  <button
    type="button"
    aria-expanded={open}
    aria-controls={open ? `${id}-panel` : undefined}
    onmousedown={(event) => {
      if (open) event.preventDefault();
    }}
    onclick={() => (open ? shut() : void show())}
    class="flex items-baseline gap-1 tabular-nums"
  >
    <span>filter</span>
    {#if size > 0}<span>{size}</span>{/if}
    <span aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div
      id="{id}-panel"
      class="absolute top-full right-0 z-30 mt-1 w-max max-w-[min(32rem,90vw)] min-w-56 border border-ink bg-ground px-2.5 py-1"
    >
      <div class="mb-1 flex items-baseline gap-3">
        <input
          bind:this={line}
          bind:value={draft}
          {onkeydown}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Find a tag"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="{id}-tags"
          aria-activedescendant={marked === undefined
            ? undefined
            : `${id}-tag-${at}`}
          class="min-w-0 flex-1 border-b border-ink px-1 outline-none"
        />
        {#if size > 0}
          <!-- Taken on `mousedown` with the default prevented, so the caret stays
             in the line and the panel open for what is taken next. -->
          <button
            type="button"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => {
              // The control goes with the filter, and the focus is not left
              // on nothing.
              line?.focus();
              onclear();
            }}
            class="flex-none tabular-nums hover:underline"
          >
            clear {size}
          </button>
        {/if}
      </div>
      {#each bands as band (band.kind)}
        <div
          role="listbox"
          aria-label={band.label}
          aria-multiselectable="true"
          class="mb-1 border-b border-ink pb-1"
        >
          <div class="tracking-caps uppercase" aria-hidden="true">
            {band.label}
          </div>
          {#each band.lines as one (one.value)}
            {@const taken = (filter[band.kind] as readonly string[]).includes(
              one.value,
            )}
            <div data-filter={band.kind} role="none">
              <Walked
                selected={taken}
                ontake={() => ontoggle(band.kind, one.value)}
              >
                <span class="flex items-baseline gap-2.5">
                  <span aria-hidden="true" class="w-[1ch] flex-none">
                    {taken ? "▸" : ""}
                  </span>
                  <span>{one.said}</span>
                  {#if one.count !== undefined}
                    <span class="ml-auto pl-4 tabular-nums">{one.count}</span>
                  {/if}
                </span>
              </Walked>
            </div>
          {/each}
        </div>
      {/each}
      {#if walked.length === 0}
        <div class="py-px">
          {lines.length === 0 ? "No tags." : "No tag matches."}
        </div>
      {/if}
      <div
        id="{id}-tags"
        role="listbox"
        aria-label="Tags"
        aria-multiselectable="true"
        class="max-h-72 overflow-y-auto"
      >
        {#each ordinary as one (one.name)}
          {@render row(one)}
        {/each}
        {#if triggers.length > 0}
          <div
            class="mt-2 border-t border-ink pt-1 tracking-caps uppercase"
            aria-hidden="true"
          >
            templates
          </div>
          {#each triggers as one (one.name)}
            {@render row(one)}
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
