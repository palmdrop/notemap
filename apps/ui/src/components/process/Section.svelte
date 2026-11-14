<script lang="ts">
  import type { Snippet } from "svelte";

  import Unfolding from "$components/primitives/motion/Unfolding.svelte";

  /**
   * One step of the route page under its band. Drawn collapsed — the band
   * alone — until it is pressed or the flow reaches it, except where it
   * already holds something. `hidden` is a step not on screen, on a phone,
   * where the steps come one at a time.
   */
  let {
    hidden = false,
    name,
    open,
    ontoggle,
    children,
  }: {
    hidden?: boolean;
    name: string;
    open: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<section data-step={name} class={hidden ? "hidden" : ""}>
  <button
    type="button"
    aria-expanded={open}
    onclick={ontoggle}
    class="flex min-h-9 w-full items-center border-y border-rule bg-band px-gutter text-left font-display text-weekday lowercase"
  >
    {name}
  </button>
  {#if open}
    <div class="min-w-0 py-3">
      <Unfolding>{@render children()}</Unfolding>
    </div>
  {/if}
</section>
