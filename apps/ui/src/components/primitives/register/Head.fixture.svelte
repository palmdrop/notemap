<script lang="ts">
  import Day from "./Day.svelte";
  import Head from "./Head.svelte";

  let { dated = false }: { dated?: boolean } = $props();
</script>

<Head><button type="button">timeline</button></Head>
{#if dated}
  <Day at="2026-09-13T07:02:00.000Z" />
{/if}
