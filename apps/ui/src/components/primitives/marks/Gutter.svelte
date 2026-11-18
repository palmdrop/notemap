<script lang="ts">
  /**
   * The bar left of a row while rows are being marked: solid on a marked row,
   * an outline on the row the keys are on, both where the two are one.
   */
  let {
    marked = false,
    cursor = false,
  }: {
    marked?: boolean;
    cursor?: boolean;
  } = $props();
</script>

{#if marked || cursor}
  <!-- Marked rows are tinted and ticked by the row itself; the keys' place
       while marking is a ruled edge. Nothing here takes width. -->
  <span
    data-gutter={marked ? "marked" : "cursor"}
    data-cursor={cursor ? "" : undefined}
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 {cursor
      ? 'outline outline-1 -outline-offset-1 outline-ink'
      : ''}"
  ></span>
{/if}
