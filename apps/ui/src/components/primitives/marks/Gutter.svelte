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
  <!-- Marked rows are tinted and ticked by the row itself, and the row draws
       the keys' place as a ruled edge. Nothing here takes width. -->
  <span
    data-gutter={marked ? "marked" : "cursor"}
    data-cursor={cursor ? "" : undefined}
    aria-hidden="true"
    class="pointer-events-none absolute inset-0"
  ></span>
{/if}
