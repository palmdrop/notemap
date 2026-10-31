<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Item } from "@notemap/client";

  import Gutter from "$components/primitives/marks/Gutter.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Day from "$components/primitives/register/Day.svelte";
  import Register from "$components/primitives/register/Register.svelte";
  import { isImage } from "$lib/attachments";
  import { client } from "$lib/client";
  import { byDay as headed, plain } from "$lib/days";
  import { lineOf } from "$lib/excerpt";
  import { pickedBy, type Picked } from "$lib/marking.svelte";
  import { doubled, pickable, unselecting } from "$lib/pick";
  import { bringIntoView, following, slide } from "$lib/motion";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * One line per item, for scanning rather than reading: the stamp, the first
   * words, the tags. Where more than half a day passed between two items the
   * list opens a gap — one fixed size, not proportional — so time passing is
   * read from the space. Read by day, a heading says that a day passed
   * instead, and a line keeps only its time. The selected line opens into
   * the whole row, drawn by the surface.
   */
  let {
    items,
    selected,
    byDay = false,
    dayAt,
    leads = false,
    motion,
    slim = false,
    open,
    marked,
    cursor,
    onselect,
    onprocess,
  }: {
    items: readonly Item[];
    selected: string | undefined;
    byDay?: boolean;
    /** The instant a line is headed by, where it is not its capture time. */
    dayAt?: (item: Item) => string;
    /** Straight under the list head, whose line the first heading then shares. */
    leads?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
    /** The register the opened row is drawn on holds a time and nothing more. */
    slim?: boolean;
    /** The selected item as a whole row. */
    open: Snippet<[Item, boolean]>;
    /** Whether a line is marked for a batch. */
    marked?: (id: string) => boolean;
    /** The line the keys are on while lines are being marked. */
    cursor?: string;
    onselect: (id: string, how: Picked) => void;
    onprocess: (id: string) => void;
  } = $props();

  const HALF_A_DAY = 12 * 60 * 60 * 1000;

  /** Null once a line has opened into its row, which brings itself into view. */
  let stamps = $state<Record<string, HTMLElement | null | undefined>>({});

  /** Brings a line into view, for the keys that walk the list. */
  export function reveal(id: string): void {
    const stamp = stamps[id];
    if (stamp !== undefined && stamp !== null) bringIntoView(stamp);
  }

  const lines = $derived(
    (byDay ? headed(items, dayAt) : plain(items)).map((one, at, all) => {
      if (one.kind === "day") return one;
      const item = one.row;
      const before = all[at - 1];
      return {
        kind: "line" as const,
        key: one.key,
        item,
        opens: one.opens,
        said: lineOf(client.says(item)) ?? whatItIs(item),
        gap:
          !byDay &&
          before?.kind === "row" &&
          Math.abs(
            Date.parse(item.createdAt) - Date.parse(before.row.createdAt),
          ) > HALF_A_DAY,
        tags: (item.tags ?? []).map((tag) => ({
          name: tag.name,
          fires: triggeredBy(tag.name) !== undefined,
        })),
      };
    }),
  );

  type Line = (typeof lines)[number];

  /** A capture with no words in it, said by what it holds instead. */
  function whatItIs(item: Item): string {
    const [first] = client.attachments(item);
    if (first === undefined) return item.payload.type;
    return first.filename ?? (isImage(first) ? "picture" : "attachment");
  }
</script>

{#snippet heading(line: Extract<Line, { kind: "day" }>)}
  <Day at={line.at} leads={leads && line.key === lines[0]?.key} {motion} />
{/snippet}

{#snippet entry(line: Extract<Line, { kind: "line" }>)}
  <!-- The line and the row it opens into are one entry, which grows and
       shrinks between the two rather than one sliding out as the other slides
       in. -->
  <div
    data-gap={line.gap ? "" : undefined}
    class="col-span-full grid grid-cols-subgrid"
    transition:slide={{ fade: true, still: motion?.still ?? true }}
    {@attach following}
  >
    <div
      class="col-span-full grid grid-cols-subgrid {line.gap
        ? 'pt-[var(--spacing-gap-time)]'
        : ''}"
    >
      {#if selected === line.item.id}
        <div class="col-span-full">
          <Register {slim}>{@render open(line.item, line.opens)}</Register>
        </div>
      {:else}
        {@render said(line)}
      {/if}
    </div>
  </div>
{/snippet}

{#snippet said(line: Extract<Line, { kind: "line" }>)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative col-span-full grid grid-cols-subgrid"
    onclick={pickable((how) => onselect(line.item.id, how))}
    onmousedown={unselecting}
    ondblclick={doubled(() => onprocess(line.item.id))}
  >
    <span class="absolute inset-y-0 -left-3 max-narrow:-left-2">
      <Gutter
        marked={marked?.(line.item.id) ?? false}
        cursor={cursor === line.item.id}
      />
    </span>
    <span
      bind:this={stamps[line.item.id]}
      class="scroll-mt-day-head whitespace-nowrap"
    >
      <Stamp
        at={line.item.createdAt}
        dated={!byDay}
        onopen={(event) => onselect(line.item.id, pickedBy(event))}
        marked={marked?.(line.item.id) ?? false}
        inline
      />
    </span>
    <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
      {line.said}
    </span>
    <span class="text-right whitespace-nowrap max-narrow:hidden">
      <span class="inline-flex gap-x-[1ch]">
        {#each line.tags as tag (tag.name)}
          {@const said =
            tag.fires && tag.name.startsWith(TRIGGER_NAMESPACE)
              ? tag.name.slice(TRIGGER_NAMESPACE.length)
              : tag.name}
          <span
            data-word={said}
            class="steady-weight {tag.fires
              ? 'font-semibold tracking-[0.04em] [font-variant-caps:all-small-caps]'
              : ''}"
          >
            {said}
          </span>
        {/each}
      </span>
    </span>
  </div>
{/snippet}

<div
  class="grid grid-cols-[max-content_1fr_max-content] gap-x-6 max-narrow:grid-cols-[max-content_1fr]"
>
  {#each lines as line (line.key)}
    <!-- Not an `{#if}`: that would be the block the transitions belong to,
         and they would play only when it turned, never as a line comes or
         goes. A render is transparent to them. -->
    {@render (line.kind === "day" ? heading : entry)(line as never)}
  {/each}
</div>
