<script lang="ts">
  import { untrack } from "svelte";

  import type { Item } from "@notemap/client";

  import Edit from "./Edit.svelte";
  import EditFoot from "./EditFoot.svelte";
  import { Rewrite } from "./rewrite.svelte";

  let { item, ondone }: { item: Item; ondone: () => void } = $props();

  const rewrite = new Rewrite(
    untrack(() => item),
    () => ondone(),
  );
</script>

<Edit {rewrite} />
<EditFoot {rewrite} />
