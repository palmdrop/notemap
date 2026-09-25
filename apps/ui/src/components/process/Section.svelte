<script lang="ts">
  import type { Snippet } from "svelte";

  import { slide } from "$lib/motion";

  /**
   * One ruled section of the surface: a label column and a content column.
   * Drawn collapsed — the label alone — until it is pressed or the flow reaches
   * it, except where it already holds something.
   */
  let {
    name,
    open,
    ontoggle,
    children,
  }: {
    name: string;
    open: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<section
  class="grid grid-cols-[9rem_1fr] border-b border-ink py-3 max-narrow:grid-cols-1 max-narrow:gap-1 max-narrow:py-2.5"
>
  <button
    type="button"
    aria-expanded={open}
    onclick={ontoggle}
    class="self-start text-left font-semibold tracking-caps uppercase hover:underline"
  >
    {name}
  </button>
  {#if open}
    <div class="min-w-0" transition:slide={{ magnitude: "short" }}>
      {@render children()}
    </div>
  {/if}
</section>
