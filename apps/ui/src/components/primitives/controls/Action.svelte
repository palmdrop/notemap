<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `primary` is bold and means *the action* — one per context. With an `href`
   * it is somewhere to go rather than something to do, and the browser's own
   * gesture — a new tab, a copied address — comes with it.
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
    `hover:underline disabled:no-underline ${primary ? "font-semibold" : ""}`,
  );
</script>

{#if href === undefined}
  <button type={submit ? "submit" : "button"} {disabled} {onclick} class={look}>
    {@render children()}
  </button>
{:else if disabled}
  <span aria-disabled="true">
    {@render children()}
  </span>
{:else}
  <a {href} class={look}>{@render children()}</a>
{/if}
