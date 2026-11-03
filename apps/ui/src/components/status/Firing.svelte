<script lang="ts">
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { notes } from "$lib/batching";
  import { left, offerOf, type Firing } from "$lib/firings.svelte";

  import { PANEL } from "./panel";

  /**
   * Routes in flight: a trigger tag's, or a decision made by hand. One says its
   * name and how long is left to call it off, and offers `undo`; once its window
   * has closed the count gives way to the asking mark, the delivery being
   * attempted, and nothing is offered until the pool says it will try again,
   * when the offer is `cancel`. More than one are counted, and read and called
   * off one by one in the panel — unless one batch fired them all, which is
   * said and cancelled as one.
   */
  let {
    open,
    now,
    expanded,
    oncancel,
    oncancelbatch,
    ontoggle,
  }: {
    open: readonly Firing[];
    now: number;
    expanded: boolean;
    oncancel: (firing: Firing) => void;
    oncancelbatch: (batch: string) => void;
    ontoggle: () => void;
  } = $props();

  const batch = $derived.by(() => {
    const first = open[0]?.batch;
    return open.length > 1 &&
      first !== undefined &&
      open.every((firing) => firing.batch === first)
      ? first
      : undefined;
  });

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
  {@const word = offerOf(firing, now)}
  <span class="flex flex-none items-baseline gap-2 whitespace-nowrap">
    <span class="max-narrow:hidden"
      >routing <span class="font-semibold">{firing.name}</span
      >{#if firing.where !== undefined}&nbsp;{firing.where}{/if}</span
    >
    <span class="narrow:hidden">routing</span>
    {#if seconds !== undefined}
      <span class="tabular-nums">{seconds}s</span>
    {:else}
      <Asking />
    {/if}
    {#if word !== undefined}
      <button
        type="button"
        class="underline"
        aria-label={`${word} routing ${firing.name}`}
        onclick={() => oncancel(firing)}
      >
        {word}
      </button>
    {/if}
  </span>
{:else if batch !== undefined}
  {@const name = open[0]!.name}
  <span class="flex flex-none items-baseline gap-2 whitespace-nowrap">
    <span class="max-narrow:hidden"
      >routing {notes(open.length)} with
      <span class="font-semibold">{name}</span></span
    >
    <span class="narrow:hidden">routing {open.length}</span>
    {#if soonest !== undefined}
      <span class="tabular-nums">{soonest}s</span>
    {:else}
      <Asking />
    {/if}
    {#if open.some((firing) => offerOf(firing, now) !== undefined)}
      <button
        type="button"
        class="underline"
        aria-label={`cancel routing ${notes(open.length)} with ${name}`}
        onclick={() => oncancelbatch(batch)}
      >
        cancel
      </button>
    {/if}
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
