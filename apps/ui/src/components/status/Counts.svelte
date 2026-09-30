<script lang="ts">
  import { resolve } from "$app/paths";

  import { PANEL } from "./panel";

  /**
   * The right of the status line, each drawn only while it is true: what this
   * device holds, what stands to be cleared, and how much the queue holds.
   * Reachability is always said, last. Below `narrow` the words go and a
   * number and a mark stay.
   */
  let {
    pending,
    clear,
    queue,
    reachable,
    expanded,
    ontoggle,
  }: {
    pending: number;
    clear: number;
    queue?: number;
    reachable: boolean;
    expanded: boolean;
    ontoggle: () => void;
  } = $props();

  const reach = $derived(reachable ? "reachable" : "unreachable");
</script>

{#if pending > 0}
  <button
    type="button"
    class="flex-none whitespace-nowrap tabular-nums"
    aria-label={`${String(pending)} pending`}
    aria-expanded={expanded}
    aria-controls={PANEL}
    onclick={ontoggle}
  >
    <span class="max-narrow:hidden">{pending} pending</span>
    <span class="narrow:hidden"
      ><span class="text-glyph">◐</span> {pending}</span
    >
  </button>
{/if}

{#if clear > 0}
  <button
    type="button"
    class="flex-none whitespace-nowrap text-alarm tabular-nums"
    aria-label={`${String(clear)} to clear`}
    aria-expanded={expanded}
    aria-controls={PANEL}
    onclick={ontoggle}
  >
    <span class="max-narrow:hidden">{clear} to clear</span>
    <span class="narrow:hidden">! {clear}</span>
  </button>
{/if}

{#if queue !== undefined}
  <a
    href={resolve("/")}
    class="flex-none whitespace-nowrap tabular-nums max-narrow:hidden"
  >
    {queue} in queue
  </a>
{/if}

<span
  role="img"
  aria-label={reach}
  title={reach}
  class="flex flex-none items-baseline gap-2 whitespace-nowrap"
>
  <span class="text-glyph">{reachable ? "●" : "○"}</span>
  {#if !reachable}
    <span class="max-narrow:hidden">offline</span>
  {/if}
</span>
