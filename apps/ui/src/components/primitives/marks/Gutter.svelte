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
  <span
    data-gutter={marked ? "marked" : "cursor"}
    data-cursor={cursor ? "" : undefined}
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 left-0 w-1 border border-ink {marked
      ? 'bg-ink'
      : ''} {marked && cursor
      ? 'outline outline-1 outline-offset-1 outline-ink'
      : ''}"
  ></span>
{/if}
