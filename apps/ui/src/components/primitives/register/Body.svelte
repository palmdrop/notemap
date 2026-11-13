<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Picked } from "$lib/marking.svelte";
  import { doubled, pickable, unselecting } from "$lib/pick";

  let {
    selected = false,
    onpick,
    onreach,
    gap = false,
    children,
  }: {
    /** Draws the head and the right edge of the box a selected row is. */
    selected?: boolean;
    onpick?: (how: Picked) => void;
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
  onmousedown={onpick === undefined ? undefined : unselecting}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-body
  data-selected={selected ? "" : undefined}
  class="col-start-2 flex min-w-0 flex-col gap-3 py-4 pr-gutter wide:pr-36
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(4)+var(--spacing-gap-time))]' : ''}"
>
  {@render children?.()}
</div>
