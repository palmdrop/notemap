<script lang="ts">
  import type { Surface } from "@notemap/client";

  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";

  let {
    surface,
    refused,
    first = false,
  }: {
    surface: Surface;
    refused: string;
    first?: boolean;
  } = $props();
</script>

<Rail {first}>{surface}</Rail>
<Body {first}>
  <div role="status" class="text-alarm">{refused}</div>
</Body>
