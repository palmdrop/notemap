<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The surface itself, as one grid. Every item drops a rail cell and a body
   * cell into it, so the two columns stay in register without either one
   * knowing how tall the other is.
   */
  let { furled = false, children }: { furled?: boolean; children: Snippet } =
    $props();
</script>

<div
  data-furled={furled ? "" : undefined}
  class="group grid {furled
    ? 'grid-cols-[0_1fr] gap-x-0'
    : 'grid-cols-[var(--spacing-rail)_1fr] gap-x-gap'}"
>
  {@render children()}
</div>
