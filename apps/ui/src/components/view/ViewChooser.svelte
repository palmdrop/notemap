<script lang="ts">
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import type { View } from "$lib/view";

  let { view, onchoose }: { view: View; onchoose: (view: View) => void } =
    $props();

  const VIEWS: readonly { value: View; word: string }[] = [
    { value: "timeline", word: "Rows" },
    { value: "index", word: "Index" },
  ];
</script>

<Segmented label="View" value={view} options={VIEWS} {onchoose} />
