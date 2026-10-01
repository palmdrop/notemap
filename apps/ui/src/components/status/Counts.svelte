<script lang="ts">
  import { resolve } from "$app/paths";

  import { PANEL } from "./panel";

  /**
   * The right of the status line, each drawn only while it is true: what this
   * device holds, how much the queue holds, and `offline` while the pool does
   * not answer. Below `narrow` the words go and a number and a mark stay.
   */
  let {
    pending,
    queue,
    reachable,
    expanded,
    ontoggle,
  }: {
    pending: number;
    queue?: number;
    reachable: boolean;
    expanded: boolean;
    ontoggle: () => void;
  } = $props();
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

{#if queue !== undefined}
  <a
    href={resolve("/")}
    class="flex-none whitespace-nowrap tabular-nums max-narrow:hidden"
  >
    {queue} in queue
  </a>
{/if}

<!-- Nothing while the pool answers, which is the ordinary state and says nothing. -->
{#if !reachable}
  <span role="status" class="flex-none whitespace-nowrap">offline</span>
{/if}
