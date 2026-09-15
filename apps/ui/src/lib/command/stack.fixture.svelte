<script lang="ts">
  import { publish } from "./stack.svelte";

  let { id }: { id: string } = $props();

  publish(() => [{ id, label: id, run: () => undefined }]);
</script>
