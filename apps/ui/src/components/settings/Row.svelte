<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One line of a section: a mark, what it is in capitals, and why at the far
   * end. `tone` colours the mark and the word together, so the colour is never
   * the only thing saying it.
   */
  let {
    mark,
    what,
    why,
    tone = "plain",
    children,
  }: {
    mark: string;
    what: string;
    why?: string;
    tone?: "plain" | "good" | "bad" | "quiet";
    children?: Snippet;
  } = $props();

  const inked = {
    plain: "",
    good: "text-good",
    bad: "text-accent",
    quiet: "text-ink-muted",
  };
</script>

<div
  class="flex flex-wrap items-baseline gap-x-3 border-b border-b-ink/20 py-3"
>
  <span aria-hidden="true" class="w-[1ch] flex-none {inked[tone]}">{mark}</span>
  <span class="tracking-wider uppercase {inked[tone]}">{what}</span>
  {#if why !== undefined}
    <span
      class="ml-auto text-right text-ink-muted max-narrow:ml-[var(--spacing-mark)] max-narrow:w-full max-narrow:text-left"
    >
      {why}
    </span>
  {/if}
  {@render children?.()}
</div>
