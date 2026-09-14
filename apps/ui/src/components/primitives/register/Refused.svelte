<script lang="ts">
  import type { Surface } from "@notemap/client";

  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";

  let { surface, refused }: { surface: Surface; refused: string } = $props();
</script>

<Rail>{surface}</Rail>
<Body>
  <div role="status" class="text-alarm">{refused}</div>
</Body>
