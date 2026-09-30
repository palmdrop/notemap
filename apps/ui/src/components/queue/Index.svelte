<script lang="ts">
  import type { Item } from "@notemap/client";

  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Day from "$components/primitives/register/Day.svelte";
  import { client } from "$lib/client";
  import { byDay as headed, plain } from "$lib/days";
  import { lineOf } from "$lib/excerpt";
  import { doubled, pickable } from "$lib/pick";
  import { slide } from "$lib/motion";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * One line per item, for scanning rather than reading: the stamp, the first
   * words, the tags. Where more than half a day passed between two items the
   * list opens a gap — one fixed size, not proportional — so time passing is
   * read from the space. Read by day, a heading says that a day passed
   * instead, and a line keeps only its time.
   */
  let {
    items,
    selected,
    byDay = false,
    motion,
    onselect,
    onprocess,
  }: {
    items: readonly Item[];
    selected: string | undefined;
    byDay?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
    onselect: (id: string) => void;
    onprocess: (id: string) => void;
  } = $props();

  const HALF_A_DAY = 12 * 60 * 60 * 1000;

  let stamps = $state<Record<string, HTMLElement | undefined>>({});

  /** Brings a line into view, for the keys that walk the list. */
  export function reveal(id: string): void {
    stamps[id]?.scrollIntoView({ block: "nearest" });
  }

  const lines = $derived(
    (byDay ? headed(items) : plain(items)).map((one, at, all) => {
      if (one.kind === "day") return one;
      const item = one.row;
      const before = all[at - 1];
      return {
        kind: "line" as const,
        key: one.key,
        item,
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

  /** A capture with no words in it, said by what it holds instead. */
  function whatItIs(item: Item): string {
    return client.images(item).length > 0 ? "picture" : item.payload.type;
  }
</script>

<div
  class="grid grid-cols-[max-content_1fr_max-content] gap-x-6 max-narrow:grid-cols-[max-content_1fr]"
>
  {#each lines as line (line.key)}
    {#if line.kind === "day"}
      <Day at={line.at} {motion} />
    {:else}
      {@const on = selected === line.item.id}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        data-gap={line.gap ? "" : undefined}
        class="col-span-full grid grid-cols-subgrid transition-[font-weight] duration-(--duration-short) ease-fade {on
          ? 'font-semibold'
          : ''}"
        transition:slide={{ fade: true, still: motion?.still ?? true }}
        onclick={pickable(() => onselect(line.item.id))}
        ondblclick={doubled(() => onprocess(line.item.id))}
      >
        <span
          bind:this={stamps[line.item.id]}
          class="{line.gap ? 'pt-[var(--spacing-gap-time)]' : ''} {byDay
            ? 'scroll-mt-day-head'
            : ''} whitespace-nowrap"
        >
          <Stamp
            at={line.item.createdAt}
            dated={!byDay}
            opened={on}
            onopen={() => onselect(line.item.id)}
            inline
          />
        </span>
        <span
          class="{line.gap
            ? 'pt-[var(--spacing-gap-time)]'
            : ''} min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {line.said}
        </span>
        <span
          class="{line.gap
            ? 'pt-[var(--spacing-gap-time)]'
            : ''} text-right whitespace-nowrap max-narrow:hidden"
        >
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
    {/if}
  {/each}
</div>
