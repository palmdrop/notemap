<script lang="ts">
  import { itemHref } from "$components/item/href";
  import { shortened } from "$lib/actions";
  import { client } from "$lib/client";
  import { excerptOf } from "$lib/excerpt";

  import { logHref } from "./href";
  import type { Order } from "@notemap/client";

  /**
   * Which capture an entry is about, as a way to it. An id is what the pool
   * says and nothing a person recognises, so the capture's own first words are
   * drawn where this shell holds them — and the way to the item comes first,
   * the log narrowed to it being the second thing somebody wants and not the
   * first.
   */
  let { id, order }: { id: string; order: Order } = $props();

  const held = $derived(client.held(id));
  const item = $derived($held);

  /** Nothing is read for this: what the cache has, or the id it has instead. */
  const said = $derived(
    item === undefined ? undefined : excerptOf(client.says(item)),
  );
</script>

<div class="mt-2 text-ink-muted">
  about <a href={itemHref(id)} class="text-ink">{said ?? shortened(id)}</a>
  <a href={logHref(order, id)} class="ml-2">only this</a>
</div>
