<script lang="ts">
  /**
   * One glyph for the whole shell: whether the pool answers, and whether this
   * device still holds work it has not seen. Stated once; no row repeats it.
   */
  let { reachable, waiting }: { reachable: boolean; waiting: number } =
    $props();

  const said = $derived(
    waiting > 0
      ? `${waiting} waiting, ${reachable ? "reachable" : "unreachable"}`
      : reachable
        ? "reachable"
        : "unreachable",
  );
</script>

<span role="status" title={said} aria-label={said} class="text-glyph">
  {waiting > 0 ? "◐" : reachable ? "●" : "○"}
</span>
