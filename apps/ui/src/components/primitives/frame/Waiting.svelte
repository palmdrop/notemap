<script lang="ts">
  let { count }: { count: number } = $props();
</script>

{#if count > 0}
  <span role="status">{count} waiting</span>
{/if}
