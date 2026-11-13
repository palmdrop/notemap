<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";

  /**
   * An action standing alone in a page — Check again, Reclaim, Edit under a
   * preview, More options — and every button that is not in a bar or a
   * choice: a beige box. `danger` is red words in it.
   */
  let {
    icon,
    danger = false,
    disabled = false,
    working = false,
    title,
    href,
    onclick,
    children,
  }: {
    icon?: IconName;
    danger?: boolean;
    disabled?: boolean;
    working?: boolean;
    title?: string;
    href?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const look = $derived(
    `inline-flex min-h-9 items-center gap-1.5 rounded-control border border-off-line bg-off px-3.5 whitespace-nowrap active:bg-off-down disabled:text-muted disabled:opacity-60 ${
      danger ? "text-danger" : "text-ink"
    }`,
  );
</script>

{#if href !== undefined && !disabled}
  <a {href} {title} class={look}>
    {#if icon !== undefined}<Icon name={icon} class="size-[1.125rem]" />{/if}
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    disabled={disabled || working}
    aria-busy={working || undefined}
    {title}
    {onclick}
    class={look}
  >
    {#if working}
      <Spinner />
    {:else if icon !== undefined}
      <Icon name={icon} class="size-[1.125rem]" />
    {/if}
    {@render children()}
  </button>
{/if}
