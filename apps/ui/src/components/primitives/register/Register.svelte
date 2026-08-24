<script lang="ts">
  import type { Snippet } from "svelte";

  import Furl from "./Furl.svelte";

  /**
   * The surface itself, as one grid. Every item drops a rail cell and a body
   * cell into it, so the two columns stay in register without either one
   * knowing how tall the other is.
   *
   * `onfurl` is what makes the rail foldable. A surface that is a register
   * without being a list of captures — settings — passes none and keeps both
   * columns, there being nothing there worth reading without them.
   */
  let {
    furled = false,
    onfurl,
    children,
  }: {
    furled?: boolean;
    onfurl?: () => void;
    children: Snippet;
  } = $props();
</script>

{#if onfurl !== undefined}
  <Furl {furled} ontoggle={onfurl} />
{/if}

<div
  data-furled={furled && onfurl !== undefined ? "" : undefined}
  class="group grid {furled && onfurl !== undefined
    ? 'grid-cols-[0_1fr] gap-x-0'
    : 'grid-cols-[var(--spacing-rail)_1fr] gap-x-gap'}"
>
  {@render children()}
</div>
