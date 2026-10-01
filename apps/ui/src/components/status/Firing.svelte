<script lang="ts">
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { left, type Firing } from "$lib/firings.svelte";

  import { PANEL } from "./panel";

  /**
   * Routes a trigger tag has in flight. One says its template and how long is
   * left to call it off, and offers the cancel; once its window has closed the
   * count gives way to the asking mark, the delivery being attempted. More than
   * one are counted, and read and cancelled one by one in the panel.
   */
  let {
    open,
    now,
    expanded,
    oncancel,
    ontoggle,
  }: {
    open: readonly Firing[];
    now: number;
    expanded: boolean;
    oncancel: (firing: Firing) => void;
    ontoggle: () => void;
  } = $props();

  const soonest = $derived(
    open
      .map((firing) => left(firing, now))
      .filter((seconds) => seconds !== undefined)
      .reduce<number | undefined>(
        (least, seconds) =>
          least === undefined ? seconds : Math.min(least, seconds),
        undefined,
      ),
  );
</script>

{#if open.length === 1}
  {@const firing = open[0]!}
  {@const seconds = left(firing, now)}
  <span class="flex flex-none items-baseline gap-2 whitespace-nowrap">
    <span class="max-narrow:hidden">routing · {firing.name}</span>
    <span class="narrow:hidden">routing</span>
    {#if seconds !== undefined}
      <span class="tabular-nums">{seconds}s</span>
    {:else}
      <Asking />
    {/if}
    <button
      type="button"
      class="underline"
      aria-label={`cancel routing · ${firing.name}`}
      onclick={() => oncancel(firing)}
    >
      cancel
    </button>
  </span>
{:else if open.length > 1}
  <button
    type="button"
    class="flex-none whitespace-nowrap"
    aria-expanded={expanded}
    aria-controls={PANEL}
    onclick={ontoggle}
  >
    routing {open.length}{#if soonest !== undefined}<span class="tabular-nums"
        >&ensp;{soonest}s</span
      >{/if}
  </button>
{/if}
