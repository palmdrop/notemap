<script lang="ts">
  /**
   * Anything under way: a route in its window, sending, retrying, a request
   * not yet answered. The words beside it say what; `said` is for a reader
   * where there are none.
   */
  let { said }: { said?: string } = $props();
</script>

<span
  data-spinner
  role={said === undefined ? undefined : "img"}
  aria-label={said}
  aria-hidden={said === undefined ? "true" : undefined}
  title={said}
  class="inline-block size-3 shrink-0 spinner"
></span>
