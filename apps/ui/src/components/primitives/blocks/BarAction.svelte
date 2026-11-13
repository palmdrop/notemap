<script lang="ts">
  import { chordFor } from "$lib/command/bindings";
  import { spoken } from "$lib/command/keys";
  import { width } from "$lib/breakpoint";
  import Icon, { type IconName } from "$components/primitives/icon/Icon.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";

  /**
   * One action in a bar. On a phone the main one is a wide filled block and
   * the others an icon over a word, with no box; in a wide toolbar each is an
   * icon beside its word. A main action that cannot be taken yet stays in its
   * place, dashed, and the bar's line says why. `command` names the binding
   * a wide window shows in the tooltip.
   */
  let {
    icon,
    label,
    primary = false,
    danger = false,
    disabled = false,
    working = false,
    why,
    command,
    href,
    onclick,
  }: {
    icon?: IconName;
    label: string;
    primary?: boolean;
    danger?: boolean;
    disabled?: boolean;
    working?: boolean;
    /** Why it cannot be taken: the main action is then dashed, not greyed. */
    why?: string;
    command?: string;
    href?: string;
    onclick?: () => void;
  } = $props();

  const held = $derived(disabled || why !== undefined);
  const head = $derived(width.wide);
  const chord = $derived(command === undefined ? undefined : chordFor(command));
  const title = $derived(
    why ??
      (head && chord !== undefined ? `${label} (${spoken(chord)})` : undefined),
  );

  const look = $derived(
    primary
      ? `flex-1 flex-row gap-2 rounded-control px-4 ${head ? "max-w-48 min-h-10 ml-auto" : "min-h-12"} ${
          why !== undefined
            ? "border border-dashed border-off-line bg-paper text-muted"
            : "border border-ink bg-ink text-paper active:bg-muted disabled:opacity-40"
        }`
      : `rounded-control px-2.5 ${head ? "flex-row gap-1.5 min-h-10" : "flex-col gap-1 min-h-target text-small leading-none"} ${
          danger ? "text-danger" : "text-ink"
        } active:bg-off-down disabled:opacity-40`,
  );
</script>

{#if href !== undefined && !held}
  <a {href} {title} class="inline-flex items-center justify-center {look}">
    {#if icon !== undefined}<Icon name={icon} class="size-5" />{/if}
    <span>{label}</span>
  </a>
{:else}
  <button
    type="button"
    disabled={disabled || working}
    aria-disabled={why !== undefined ? "true" : undefined}
    aria-busy={working || undefined}
    {title}
    onclick={() => {
      if (why === undefined) onclick?.();
    }}
    class="inline-flex min-w-0 items-center justify-center {look}"
  >
    {#if working}
      <Spinner />
    {:else if icon !== undefined}
      <Icon name={icon} class="size-5" />
    {/if}
    <span>{label}</span>
  </button>
{/if}
