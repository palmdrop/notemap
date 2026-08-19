<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * `primary` is the accent fill and means *the action* — one per context.
   * Disabled reads as unavailable, in muted ink, rather than as broken.
   */
  let {
    primary = false,
    disabled = false,
    onclick,
    children,
  }: {
    primary?: boolean;
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  {disabled}
  {onclick}
  class="font-mono disabled:text-ink-muted {primary
    ? '-mx-2 bg-accent px-2 text-paper disabled:bg-transparent'
    : 'hover:text-accent'}"
>
  {@render children()}
</button>
