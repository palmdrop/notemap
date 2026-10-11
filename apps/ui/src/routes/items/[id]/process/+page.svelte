<script lang="ts">
  import ProcessPage from "$components/process/ProcessPage.svelte";

  let { data }: { data: { id: string } } = $props();
</script>

<svelte:head>
  <title>
    Processing item | Notemap
  </title>
</svelte:head>

<ProcessPage id={data.id} />
