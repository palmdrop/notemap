<script lang="ts">
  import Record from "$components/record/Record.svelte";

  let { data }: { data: { id: string; record: string } } = $props();
</script>

<Record item={data.id} record={data.record} />
