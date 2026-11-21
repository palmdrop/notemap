<script lang="ts">
  import Record from "$components/record/Record.svelte";

  let { data }: { data: { id: string; record: string } } = $props();
</script>

<svelte:head>
  <title>Item records | Notemap</title>
</svelte:head>

<!-- Its rows run to the window's edge, what is in them kept to the measure. -->
<div class="wide:measured">
  <Record item={data.id} record={data.record} />
</div>
