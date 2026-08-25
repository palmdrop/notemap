<script lang="ts">
  import type { Snippet } from "svelte";

  import Furl from "./Furl.svelte";

  /** Without `onfurl` the rail cannot be folded away, which settings wants. */
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
