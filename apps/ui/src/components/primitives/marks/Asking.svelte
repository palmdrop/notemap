<script lang="ts" module>
  /** A wait shorter than this is an answer, and draws nothing. */
  export const SHOWN_AFTER = 250;

  /** How long a named subject may take before it is said to be slow. */
  export const SLOW_AFTER = 3000;
</script>

<script lang="ts">
  import { onMount } from "svelte";

  import { ASKING, slowToAnswer } from "$lib/said";

  /**
   * Three squares stepping, for a request the shell holds no answer to yet.
   * It takes its line from the start, hidden, so appearing moves nothing.
   * `subject` names what is being asked when that is worth knowing: past
   * `slow`, the mark says it is slow to answer.
   */
  let {
    subject,
    slow = SLOW_AFTER,
    shown = $bindable(false),
  }: {
    subject?: string;
    slow?: number;
    shown?: boolean;
  } = $props();

  let late = $state(false);

  onMount(() => {
    const showing = setTimeout(() => (shown = true), SHOWN_AFTER);
    const slowing = setTimeout(() => (late = true), slow);
    return () => {
      clearTimeout(showing);
      clearTimeout(slowing);
    };
  });

  const said = $derived(
    late && subject !== undefined ? slowToAnswer(subject) : undefined,
  );
</script>

<span
  role="status"
  data-asking={shown ? "shown" : "hidden"}
  class="inline-flex items-center gap-[1ch] {shown ? '' : 'invisible'}"
>
  <span class="inline-flex gap-1" aria-hidden="true">
    {#each [0, 1, 2] as beat (beat)}
      <span
        class="size-1.5 animate-step border border-ink motion-reduce:animate-none {beat ===
        1
          ? '[animation-delay:var(--duration-step)]'
          : beat === 2
            ? '[animation-delay:calc(var(--duration-step)*2)]'
            : ''}"
      ></span>
    {/each}
  </span>
  {#if said === undefined}
    <span class="sr-only">{ASKING}</span>
  {:else}
    <span>{said}</span>
  {/if}
</span>
