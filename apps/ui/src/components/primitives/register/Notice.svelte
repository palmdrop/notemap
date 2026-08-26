<script lang="ts">
  import type { Surface } from "@notemap/client";

  import Prose from "$components/primitives/text/Prose.svelte";

  import Body from "./Body.svelte";
  import Rail from "./Rail.svelte";

  let {
    surface,
    said,
    refused,
    first = false,
  }: {
    surface: Surface;
    said?: string;
    refused?: string;
    first?: boolean;
  } = $props();
</script>

<Rail {first}>{surface}</Rail>
<Body {first}>
  <div role="status">
    {#if said !== undefined}
      <Prose text={said} muted />
    {/if}

    {#if refused !== undefined}
      <span
        class="block font-mono text-accent {said === undefined ? '' : 'mt-2'}"
        >{refused}</span
      >
    {/if}
  </div>
</Body>
