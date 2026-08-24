<script lang="ts">
  /** Furling the rail gives the prose the whole width without hiding a row. */
  let { furled, ontoggle }: { furled: boolean; ontoggle: () => void } =
    $props();
</script>

<button
  type="button"
  onclick={ontoggle}
  aria-pressed={furled}
  class="text-ink-muted hover:text-accent"
>
  {furled ? "show metadata" : "hide metadata"}
</button>
