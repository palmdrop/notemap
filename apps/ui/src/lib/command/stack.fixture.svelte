<script lang="ts">
  import { untrack } from "svelte";

  import { publish } from "./stack.svelte";

  let { id, holds = false }: { id: string; holds?: boolean } = $props();

  publish(() => [{ id, label: id, run: () => undefined }], {
    holds: untrack(() => holds),
  });
</script>
