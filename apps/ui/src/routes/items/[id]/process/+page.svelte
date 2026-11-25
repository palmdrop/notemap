<script lang="ts">
  import ProcessPage from "$components/process/ProcessPage.svelte";
  import { lasting } from "$lib/lasting.svelte";

  let { data }: { data: { id: string } } = $props();

  const id = lasting(() => data.id);
</script>

<svelte:head>
  <title>Processing item | Notemap</title>
</svelte:head>

{#if id.current !== undefined}
  <ProcessPage id={id.current} />
{/if}
