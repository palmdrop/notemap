<script lang="ts">
  /**
   * Rides the seam between the rail and the body, which is the edge it moves.
   * A word in the bar said the same thing further from the thing it was about.
   */
  let { furled, ontoggle }: { furled: boolean; ontoggle: () => void } =
    $props();
</script>

<!-- Its own strip, so it collides with neither column in either state. -->
<div class="relative h-6">
  <button
    type="button"
    onclick={ontoggle}
    aria-pressed={furled}
    aria-label={furled ? "Show metadata" : "Hide metadata"}
    class="absolute bottom-0 px-2 font-mono leading-none text-ink-muted hover:text-accent
      {furled ? 'left-0 -ml-2' : 'left-[var(--spacing-rail)] -translate-x-1/2'}"
  >
    {furled ? "▸" : "◂"}
  </button>
</div>
