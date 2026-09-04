<script lang="ts">
  import type { Snippet } from "svelte";

  import { doubled, pickable } from "$lib/pick";

  let {
    first = false,
    lit = false,
    onpick,
    onreach,
    children,
  }: {
    first?: boolean;
    lit?: boolean;
    onpick?: () => void;
    /** Somewhere to go rather than something to do: the item's own surface. */
    onreach?: () => void;
    /** Absent where the row is all rail: the cell still holds the column open. */
    children?: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  class="col-start-2 min-w-0 border-t border-t-ink/20
    {first ? 'border-t-0 pt-3.5 pb-6' : 'py-6'}
    {onpick === undefined ? '' : 'cursor-pointer'}
    {lit
    ? '-mr-3.5 bg-ink/5 pr-3.5 [--field-ground:var(--color-paper)] group-data-furled:-ml-3.5 group-data-furled:border-l-2 group-data-furled:border-l-accent group-data-furled:pl-3'
    : ''}"
>
  {@render children?.()}
</div>
