<script lang="ts">
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";

  /**
   * A section's head: bold capitals on a rule. `sub` is the same, lower down a
   * section, for the second-level headings — access tokens under access, sources
   * under server. Below `narrow` the top-level head also carries the way back to
   * the menu, since the menu is not drawn there.
   */
  let {
    name,
    sub = false,
    right,
    children,
  }: {
    name: string;
    sub?: boolean;
    /** The one place a sub-head carries a control: `sources`' `show`/`hide`. */
    right?: Snippet;
    children: Snippet;
  } = $props();
</script>

{#if !sub}
  <a
    href={resolve("/settings")}
    class="mb-2 hidden hover:underline max-narrow:block"
  >
    ← settings
  </a>
{/if}

<div
  class="flex items-baseline justify-between gap-x-[2ch] border-b border-ink pb-2 {sub
    ? 'mt-9'
    : ''}"
>
  <span class="font-semibold tracking-caps uppercase">{name}</span>
  {#if right !== undefined}
    {@render right()}
  {/if}
</div>

{@render children()}
