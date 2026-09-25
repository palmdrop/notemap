<script lang="ts">
  import { onMount } from "svelte";

  import { SHOWN_AFTER } from "./Asking.svelte";

  /**
   * Drawn only once the work has been waiting as long as the asking mark
   * waits: most of it drains before then, and a line that came and went
   * would move the row it is in twice for nothing.
   */
  let { inline = false }: { inline?: boolean } = $props();

  let due = $state(false);

  onMount(() => {
    const showing = setTimeout(() => (due = true), SHOWN_AFTER);
    return () => clearTimeout(showing);
  });
</script>

{#if due}
  <span class="w-max {inline ? 'inline-block' : 'mt-2 block'}">pending</span>
{/if}
