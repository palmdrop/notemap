<script lang="ts">
  import { itemHref } from "$components/item/href";

  import { logHref } from "./href";
  import Says from "./Says.svelte";
  import type { Order } from "@notemap/client";

  /**
   * Which capture an entry is about, as a way to it. The way to the item comes
   * first, the log narrowed to it being the second thing somebody wants and not
   * the first.
   */
  let { id, order }: { id: string; order: Order } = $props();
</script>

<div class="mt-2 text-ink-muted">
  about <Says {id} href={itemHref(id)} />
  <a href={logHref(order, id)} class="ml-2">only this</a>
</div>
