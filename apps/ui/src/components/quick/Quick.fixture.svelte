<script lang="ts">
  import { quick } from "$lib/quicking.svelte";

  import Quick from "./Quick.svelte";

  /** The sheet as the frame draws it: open while the quick store holds an item. */
</script>

{#if quick.item !== undefined}
  <Quick item={quick.item} onclose={() => quick.close()} />
{/if}
