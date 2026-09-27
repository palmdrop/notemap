<script lang="ts">
  import { untrack } from "svelte";

  import type { Item } from "@notemap/client";

  import Edit from "./Edit.svelte";
  import EditFoot from "./EditFoot.svelte";
  import { Editing } from "./editing.svelte";

  let { item, onclose }: { item: Item; onclose: () => void } = $props();

  const editing = new Editing(
    untrack(() => item),
    () => onclose(),
  );
</script>

<Edit {editing} />
<EditFoot {editing} />
