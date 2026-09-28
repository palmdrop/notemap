<script lang="ts">
  import { triggeredBy } from "$lib/templates";

  /**
   * What a surface is filtered by, each tag ruled round with the `×` that takes
   * it off, as a carried tag is once selected. Drawn only while there is one:
   * the whole surface says nothing about it.
   */
  let {
    filter,
    onlift,
  }: {
    filter: readonly string[];
    onlift: (tag: string) => void;
  } = $props();

  const TRIGGER =
    "font-semibold [font-variant-caps:all-small-caps] tracking-[0.04em]";
</script>

{#if filter.length > 0}
  <div
    class="flex flex-wrap items-baseline gap-x-[1.5ch] gap-y-1 pb-2"
    aria-label="Filter"
  >
    <span>tagged</span>
    {#each filter as tag (tag)}
      <span
        class="-mx-0.75 inline-block px-0.75 leading-(--text-shell--line-height) whitespace-nowrap outline-1 outline-ink"
      >
        <span class={triggeredBy(tag) === undefined ? "" : TRIGGER}>{tag}</span
        ><button
          type="button"
          class="ml-1 hover:underline"
          aria-label="Stop filtering by {tag}"
          onclick={() => onlift(tag)}
        >
          ×
        </button>
      </span>
    {/each}
  </div>
{/if}
