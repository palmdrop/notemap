<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `primary` is the accent fill and means *the action* — one per context.
   * Disabled reads as unavailable, in muted ink, rather than as broken.
   * With an `href` it is somewhere to go rather than something to do, and the
   * browser's own gesture — a new tab, a copied address — comes with it.
   */
  let {
    primary = false,
    submit = false,
    disabled = false,
    href,
    onclick,
    children,
  }: {
    primary?: boolean;
    submit?: boolean;
    disabled?: boolean;
    href?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const look = $derived(
    `font-mono disabled:text-ink-muted ${
      primary
        ? "-mx-2 bg-accent px-2 text-paper disabled:bg-transparent"
        : "hover:text-accent"
    }`,
  );
</script>

{#if href === undefined}
  <button type={submit ? "submit" : "button"} {disabled} {onclick} class={look}>
    {@render children()}
  </button>
{:else if disabled}
  <span aria-disabled="true" class="font-mono text-ink-muted">
    {@render children()}
  </span>
{:else}
  <a {href} class={look}>{@render children()}</a>
{/if}
