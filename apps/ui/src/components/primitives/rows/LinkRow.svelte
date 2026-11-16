<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";

  /**
   * A row that goes somewhere or does one thing: an icon, a name with a line
   * under it, a state at the right, and a chevron where it leads on. `danger`
   * is a destructive way, red, in a band of its own.
   */
  let {
    icon,
    title,
    line,
    end,
    endDanger = false,
    danger = false,
    muted = false,
    chevron = true,
    disabled = false,
    href,
    onclick,
    badge,
    aside,
    label,
    lineDanger = false,
    strong = false,
    why,
  }: {
    icon?: IconName;
    title: string;
    line?: string;
    end?: string;
    endDanger?: boolean;
    danger?: boolean;
    muted?: boolean;
    chevron?: boolean;
    disabled?: boolean;
    href?: string;
    onclick?: () => void;
    badge?: Snippet;
    /** Drawn at the right, before the state: a trigger tag. */
    aside?: Snippet;
    /** The row's name for a reader that does not read its line and state. */
    label?: string;
    /** The line says something wrong. */
    lineDanger?: boolean;
    /** The one a typed line has narrowed to. */
    strong?: boolean;
    /** Why it cannot be taken, said in its line's place. */
    why?: string;
  } = $props();

  const look = $derived(
    `grid min-h-bar w-full items-center gap-3 border-b border-rule px-gutter py-2.5 text-left no-underline active:bg-off-down disabled:text-muted ${
      icon === undefined
        ? "grid-cols-[minmax(0,1fr)_auto]"
        : "grid-cols-[var(--spacing-icon)_minmax(0,1fr)_auto]"
    }`,
  );
</script>

{#snippet inside()}
  {#if icon !== undefined}
    <Icon
      name={icon}
      class="size-icon {danger && why === undefined
        ? 'text-danger'
        : muted || why !== undefined
          ? 'text-muted'
          : ''}"
    />
  {/if}
  <span class="min-w-0">
    <span
      class="flex flex-wrap items-center gap-2 {strong
        ? 'font-semibold'
        : ''} {danger && why === undefined
        ? 'text-danger'
        : muted
          ? 'text-muted'
          : ''}"
    >
      {title}
      {#if badge !== undefined}{@render badge()}{/if}
    </span>
    {#if (why ?? line) !== undefined}
      <small
        class="block text-small {lineDanger && why === undefined
          ? 'text-danger'
          : 'text-muted'}">{why ?? line}</small
      >
    {/if}
  </span>
  <span class="flex items-center gap-2">
    {#if aside !== undefined}{@render aside()}{/if}
    {#if end !== undefined}
      <span class="text-small {endDanger ? 'text-danger' : 'text-muted'}"
        >{end}</span
      >
    {/if}
    {#if chevron}
      <Icon name="chevron" class="size-5 text-muted" />
    {/if}
  </span>
{/snippet}

{#if href !== undefined && !disabled}
  <a {href} aria-label={label} class="{look} text-ink">{@render inside()}</a>
{:else}
  <button
    type="button"
    disabled={disabled || why !== undefined}
    aria-label={label}
    title={why}
    {onclick}
    class={look}
  >
    {@render inside()}
  </button>
{/if}
