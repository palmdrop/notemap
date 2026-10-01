<script lang="ts">
  import Chooser from "$components/primitives/controls/Chooser.svelte";
  import type { View } from "$lib/view";

  /** The two ways of reading one list, chosen as the order is. */
  let { view, onchoose }: { view: View; onchoose: (view: View) => void } =
    $props();

  const VIEWS: readonly { value: View; word: string }[] = [
    { value: "timeline", word: "timeline" },
    { value: "index", word: "index" },
  ];
</script>

<Chooser label="View" value={view} options={VIEWS} {onchoose} />
