<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "$components/primitives/icon/Icon.svelte";

  /**
   * One of choices that can all be on: a beige box of its own, filled and
   * ticked when on. Laid out with its siblings in a wrapping row.
   */
  let {
    on,
    disabled = false,
    small = false,
    label,
    ontoggle,
    children,
  }: {
    on: boolean;
    disabled?: boolean;
    small?: boolean;
    /** Its name where its words alone do not say which. */
    label?: string;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  aria-label={label}
  aria-pressed={on}
  {disabled}
  onclick={ontoggle}
  class="inline-flex items-center gap-1.5 rounded-control border {small
    ? 'min-h-8 px-3 text-small'
    : 'min-h-9 px-3.5'} {on
    ? 'border-ink bg-ink pl-2.5 text-paper'
    : 'border-off-line bg-off text-ink active:bg-off-down'} disabled:opacity-60"
>
  {#if on}<Icon name="check" class="size-4" />{/if}
  {@render children()}
</button>
