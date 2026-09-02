<script lang="ts">
  import type { Snippet } from "svelte";

  import Furl from "./Furl.svelte";

  /**
   * Without `onfurl` the rail cannot be folded away, which settings wants.
   * A `brief` rail holds a stamp and one short word rather than a row's whole
   * account, and takes a measure of its own.
   */
  let {
    furled = false,
    brief = false,
    onfurl,
    children,
  }: {
    furled?: boolean;
    brief?: boolean;
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
    : brief
      ? 'grid-cols-[var(--spacing-log-rail)_1fr] gap-x-gap'
      : 'grid-cols-[var(--spacing-rail)_1fr] gap-x-gap'}"
>
  {@render children()}
</div>
