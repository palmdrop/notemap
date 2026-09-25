<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { SHOWN_AFTER } from "./Asking.svelte";

  /**
   * Drawn only once the work has been waiting as long as the asking mark
   * waits: most of it drains before then, and a line that came and went
   * would move the row it is in twice for nothing. `since` is when the work
   * began waiting, so work that has waited long enough already is drawn at
   * once whenever its row is.
   */
  let { since, inline = false }: { since: number; inline?: boolean } = $props();

  const waited = untrack(() => Date.now() - since);
  let due = $state(waited >= SHOWN_AFTER);

  onMount(() => {
    if (due) return;
    const showing = setTimeout(() => (due = true), SHOWN_AFTER - waited);
    return () => clearTimeout(showing);
  });
</script>

{#if due}
  <span class="w-max {inline ? 'inline-block' : 'mt-2 block'}">pending</span>
{/if}
