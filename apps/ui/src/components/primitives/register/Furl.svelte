<script lang="ts">
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
    class="absolute bottom-0 px-2 leading-none hover:underline
      {furled ? 'left-0 -ml-2' : 'left-[var(--spacing-rail)] -translate-x-1/2'}"
  >
    {furled ? "▸" : "◂"}
  </button>
</div>
