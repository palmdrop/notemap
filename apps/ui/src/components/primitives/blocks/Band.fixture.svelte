<script lang="ts">
  import { setContext } from "svelte";

  import Band, { QUIET } from "./Band.svelte";

  let { quiet = false }: { quiet?: boolean } = $props();

  // Context is set once, as the component starts, which is all a fixture needs.
  // svelte-ignore state_referenced_locally
  if (quiet) setContext(QUIET, true);
</script>

<Band>where</Band>
