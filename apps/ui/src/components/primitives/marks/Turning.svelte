<script lang="ts">
  import Spinner from "./Spinner.svelte";

  /**
   * Work under way that this shell is not waiting on. `said` is what a reader
   * that cannot see it is told, and the hover.
   */
  let { said }: { said: string } = $props();
</script>

<Spinner {said} />
