<script lang="ts">
  import Record from "$components/record/Record.svelte";
  import { lasting } from "$lib/lasting.svelte";

  let { data }: { data: { id: string; record: string } } = $props();

  const id = lasting(() => data.id);
  const record = lasting(() => data.record);
</script>

<svelte:head>
  <title>Item records | Notemap</title>
</svelte:head>

<!-- Its rows run to the window's edge, what is in them kept to the measure. -->
<div class="wide:measured">
  {#if id.current !== undefined && record.current !== undefined}
    <Record item={id.current} record={record.current} />
  {/if}
</div>
