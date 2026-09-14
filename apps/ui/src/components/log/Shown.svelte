<script lang="ts">
  import { log } from "$lib/log.svelte";
</script>

<!-- A refusal takes the count's place: both are what the read has to report. -->
{#if log.refused !== undefined}
  <span role="status" class="text-alarm">{log.refused}</span>
{:else if log.shown > 0}
  <span role="status">{log.shown} shown</span>
{/if}
