<script lang="ts">
  import { untrack } from "svelte";

  import type { TagsWithin } from "@notemap/client";

  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { pickable } from "$lib/pick";
  import { triggeredBy } from "$lib/templates";

  /**
   * The tags a surface's items carry, one line each with how many of them this
   * surface holds, the way to a filter. Ordinary tags first; the trigger tags a
   * template declares apart beneath, since they say where an item went rather
   * than what it is. A tag this surface holds none of is not drawn: taking it
   * would filter to nothing.
   */
  let {
    surface,
    filter,
    onchoose,
  }: {
    surface: "queue" | "feed";
    /** What the surface is already filtered by: the tags beside it are the ones offered. */
    filter: readonly string[];
    onchoose: (tag: string) => void;
  } = $props();

  const NAMESPACE = "route/";

  let reading = $state<TagsWithin | undefined>(undefined);
  let marked = $state<string | undefined>(undefined);
  let lines = $state<Record<string, HTMLElement | undefined>>({});

  $effect(() => {
    const asked = filter;
    untrack(() => {
      reading = undefined;
      marked = undefined;
    });
    let current = true;
    void client.tags.within(asked).then((answer) => {
      if (current) reading = answer;
    });
    return () => {
      current = false;
    };
  });

  const counted = $derived(
    (reading?.values ?? [])
      .map((use) => ({
        name: use.name,
        count: surface === "queue" ? use.unprocessed : use.items,
        template: triggeredBy(use.name),
      }))
      .filter((line) => line.count > 0),
  );

  const ordinary = $derived(
    counted.filter((line) => line.template === undefined),
  );
  const triggers = $derived(
    counted.filter((line) => line.template !== undefined),
  );

  /** Walked in the order drawn, which puts the trigger band last. */
  const walked = $derived([...ordinary, ...triggers].map((line) => line.name));

  /** Whether a line is marked, for `esc` to let go of before it lifts anything. */
  export function holding(): boolean {
    return marked !== undefined;
  }

  export function unmark(): void {
    marked = undefined;
  }

  export function walk(step: 1 | -1): void {
    if (walked.length === 0) return;
    const at = marked === undefined ? -1 : walked.indexOf(marked);
    const next =
      at === -1
        ? step === 1
          ? 0
          : walked.length - 1
        : Math.min(Math.max(at + step, 0), walked.length - 1);
    marked = walked[next];
    if (marked !== undefined)
      lines[marked]?.scrollIntoView({ block: "nearest" });
  }

  /** Takes the marked tag, or marks the first where none is. */
  export function take(): void {
    if (marked === undefined) walk(1);
    else onchoose(marked);
  }

  function said(name: string, fires: boolean): string {
    return fires && name.startsWith(NAMESPACE)
      ? name.slice(NAMESPACE.length)
      : name;
  }
</script>

{#snippet line(tag: (typeof counted)[number])}
  {@const on = marked === tag.name}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={lines[tag.name]}
    data-tag={tag.name}
    class="col-span-full grid cursor-pointer grid-cols-subgrid transition-[font-weight] duration-(--duration-short) ease-fade {on
      ? 'font-semibold'
      : ''}"
    onclick={pickable(() => onchoose(tag.name))}
  >
    <button
      type="button"
      data-word={said(tag.name, tag.template !== undefined)}
      class="steady-weight min-w-0 overflow-hidden text-left text-ellipsis whitespace-nowrap hover:underline {tag.template ===
      undefined
        ? ''
        : 'font-semibold tracking-[0.04em] [font-variant-caps:all-small-caps]'}"
      title={tag.name}
      onclick={() => onchoose(tag.name)}
    >
      {said(tag.name, tag.template !== undefined)}
    </button>
    <span
      class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-narrow:hidden"
    >
      {tag.template === undefined ? "" : `→ ${tag.template.name}`}
    </span>
    <span class="text-right tabular-nums">{tag.count}</span>
  </div>
{/snippet}

{#if reading === undefined}
  <div class="pt-3"><Asking /></div>
{:else if counted.length === 0}
  <div class="pt-3">
    {filter.length === 0 ? "No tags." : "No other tags."}
  </div>
{:else}
  <div
    class="grid grid-cols-[1fr_max-content_max-content] gap-x-6 pt-3 max-narrow:grid-cols-[1fr_max-content]"
    aria-label="Tags"
  >
    {#each ordinary as tag (tag.name)}
      {@render line(tag)}
    {/each}

    {#if triggers.length > 0}
      <div
        class="col-span-full mt-4 border-t border-ink pt-1.5 tracking-caps uppercase"
      >
        templates
      </div>
      {#each triggers as tag (tag.name)}
        {@render line(tag)}
      {/each}
    {/if}
  </div>
{/if}
