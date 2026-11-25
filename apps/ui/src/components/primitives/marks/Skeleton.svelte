<script lang="ts">
  import { ASKING } from "$lib/said";

  /**
   * What will be drawn, in grey, where there is nothing to draw it from yet:
   * a list's rows in either view, an item's words, or the place a record will
   * name. It takes its room from the start and is seen only after the asking
   * mark's 250ms, so an answer quicker than that is never preceded by it.
   */
  let { shape }: { shape: "rows" | "lines" | "item" | "place" } = $props();

  /** Widths that read as words of different lengths, not as a pattern. */
  const ROWS: readonly (readonly [string, string?])[] = [
    ["78%", "42%"],
    ["64%"],
    ["86%", "58%"],
    ["52%"],
    ["70%", "34%"],
    ["60%"],
  ];
  const LINES = ["62%", "48%", "71%", "39%", "56%", "66%", "44%", "52%"];

  const BAR = "block rounded-tag bg-band motion-safe:animate-breathing";
</script>

{#snippet bar(width: string, height = "h-[0.8em]")}
  <span class="{BAR} {height}" style="width: {width}"></span>
{/snippet}

{#if shape === "place"}
  <!-- A character no one sees, so it sits on the line's baseline at the
       line's height, as the words it stands for will. -->
  <span
    data-skeleton={shape}
    aria-hidden="true"
    class="relative inline-block w-[16ch] animate-appearing"
    >&#8203;<span
      class="{BAR} absolute inset-x-0 top-1/2 h-[0.8em] -translate-y-1/2"
    ></span></span
  >
{:else}
  <div data-skeleton={shape} role="status" class="col-span-full">
    <span class="sr-only">{ASKING}</span>
    <div aria-hidden="true" class="animate-appearing">
      {#if shape === "rows"}
        <div
          class="-mt-px flex min-h-9 items-center border-y border-rule bg-band px-gutter"
        >
          <span class="{BAR} h-[0.8em] w-24 bg-tag-line"></span>
        </div>
        {#each ROWS as [first, second], at (at)}
          <div
            class="grid min-h-row grid-cols-[calc(var(--spacing-time)+var(--spacing-gutter))_minmax(0,1fr)] border-b border-rule"
          >
            <div class="py-4 pl-gutter">{@render bar("2.25rem")}</div>
            <div class="flex flex-col gap-2.5 py-4 pr-gutter">
              {@render bar(first)}
              {#if second !== undefined}{@render bar(second)}{/if}
            </div>
          </div>
        {/each}
      {:else if shape === "lines"}
        <div class="-mx-3.5 wide:-mx-8">
          {#each LINES as width, at (at)}
            <div
              class="flex min-h-10 items-center gap-4 border-b border-rule px-gutter"
            >
              {@render bar("2.25rem")}
              {@render bar(width)}
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex max-w-read flex-col gap-3">
          {@render bar("94%", "h-[1em]")}
          {@render bar("88%", "h-[1em]")}
          {@render bar("57%", "h-[1em]")}
          <div class="mt-1 flex gap-1">
            {@render bar("4rem", "h-6")}
            {@render bar("3rem", "h-6")}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
