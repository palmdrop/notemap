<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `primary` is bold and means *the action* — one per context. `alarm` is
   * the red, for a destructive one. Disabled is the one grey the shell has,
   * which is what it is for. With an `href` it is somewhere to go rather than
   * something to do, and the browser's own gesture — a new tab, a copied
   * address — comes with it.
   */
  let {
    primary = false,
    alarm = false,
    submit = false,
    disabled = false,
    title,
    href,
    onclick,
    children,
  }: {
    primary?: boolean;
    alarm?: boolean;
    submit?: boolean;
    disabled?: boolean;
    /** Why it cannot be taken, where it cannot. */
    title?: string;
    href?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const look = $derived(
    `hover:underline disabled:text-inert disabled:no-underline ${
      primary ? "font-semibold" : ""
    } ${alarm ? "text-alarm" : ""}`,
  );
</script>

{#if href === undefined}
  <button
    type={submit ? "submit" : "button"}
    {disabled}
    {title}
    {onclick}
    class={look}
  >
    {@render children()}
  </button>
{:else if disabled}
  <span aria-disabled="true" {title} class="text-inert">
    {@render children()}
  </span>
{:else}
  <a {href} class={look}>{@render children()}</a>
{/if}
