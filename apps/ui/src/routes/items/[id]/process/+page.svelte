<script lang="ts">
  import ProcessPage from "$components/process/ProcessPage.svelte";

  let { data }: { data: { id: string } } = $props();
</script>

<ProcessPage id={data.id} />
