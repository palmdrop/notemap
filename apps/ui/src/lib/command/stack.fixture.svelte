<script lang="ts">
  import { publish } from "./stack.svelte";

  import { untrack } from "svelte";

  let { id, atop = false }: { id: string; atop?: boolean } = $props();

  publish(() => [{ id, label: id, run: () => undefined }], {
    atop: untrack(() => atop),
  });
</script>
