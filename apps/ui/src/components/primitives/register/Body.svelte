<script lang="ts">
  import type { Snippet } from "svelte";

  import { doubled, pickable } from "$lib/pick";

  let {
    selected = false,
    onpick,
    onreach,
    gap = false,
    children,
  }: {
    /** Draws the head and the right edge of the box a selected row is. */
    selected?: boolean;
    onpick?: () => void;
    /** Somewhere to go rather than something to do. */
    onreach?: () => void;
    /** More than half a day passed before this row: the index's gap, opened here. */
    gap?: boolean;
    /** Absent where the row is all rail: the cell still holds the column open. */
    children?: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-selected={selected ? "" : undefined}
  class="col-start-2 -mr-3 min-w-0 border-t border-r pr-3 pb-3 pl-gutter transition-[border-color] duration-(--duration-short) ease-motion max-narrow:-mr-2 max-narrow:pr-2 max-narrow:pl-3.5
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(3)+var(--spacing-gap-time))]' : 'pt-3'}
    {selected ? 'border-ink' : 'border-transparent'}"
>
  {@render children?.()}
</div>
