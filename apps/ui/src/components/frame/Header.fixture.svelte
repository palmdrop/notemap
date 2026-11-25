<script lang="ts">
  import { headed, type Heading } from "$lib/heading.svelte";

  import Header from "./Header.svelte";

  let { heading }: { heading: Heading } = $props();

  headed(() => heading);
</script>

<Header title="settings" onmenu={() => {}} />
