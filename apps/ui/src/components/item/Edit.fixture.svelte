<script lang="ts">
  import { untrack } from "svelte";

  import type { Item } from "@notemap/client";

  import Edit from "./Edit.svelte";
  import EditBar from "./EditBar.svelte";
  import { Editing } from "./editing.svelte";

  let { item, onclose }: { item: Item; onclose: () => void } = $props();

  const editing = new Editing(
    untrack(() => item),
    () => onclose(),
  );
</script>

<Edit {editing} />
<EditBar {item} {editing} />
