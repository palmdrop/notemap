<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `primary` is the accent fill and means *the action* — one per context.
   * Disabled reads as unavailable, in muted ink, rather than as broken.
   * With an `href` it is somewhere to go rather than something to do, and the
   * browser's own gesture — a new tab, a copied address — comes with it.
   * `cell` is a grid carrying the inline padding for it, so every action in one
   * takes the same and the words align down the columns.
   */
  let {
    primary = false,
    cell = false,
    submit = false,
    disabled = false,
    href,
    onclick,
    children,
  }: {
    primary?: boolean;
    cell?: boolean;
    submit?: boolean;
    disabled?: boolean;
    href?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const look = $derived(
    `font-mono disabled:text-ink-muted ${
      primary
        ? `bg-accent text-paper disabled:bg-transparent ${cell ? "" : "-mx-2 px-2"}`
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
