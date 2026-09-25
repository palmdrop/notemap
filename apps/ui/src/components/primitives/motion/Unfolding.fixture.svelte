<script lang="ts">
  import Unfolding from "./Unfolding.svelte";

  let { open = true, lines = 1 }: { open?: boolean; lines?: number } = $props();
</script>

{#if open}
  <Unfolding>
    {#each Array.from({ length: lines }, (_, at) => at) as at (at)}
      <p>line {at}</p>
    {/each}
  </Unfolding>
{/if}
