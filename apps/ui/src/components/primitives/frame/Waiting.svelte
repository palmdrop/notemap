<script lang="ts">
  /** Pending is ordinary and heals itself, so nothing is said until there is. */
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <span role="status">{count} waiting</span>
{/if}
