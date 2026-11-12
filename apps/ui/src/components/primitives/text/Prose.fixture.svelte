<script lang="ts">
  import Prose from "./Prose.svelte";

  let { text }: { text: string } = $props();

  const terms = ["creme", "brulee", "rack"];
</script>

<Prose {text} {terms} />
