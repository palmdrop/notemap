<script lang="ts">
  import type { Snippet } from "svelte";

  import { doubled, pickable } from "$lib/pick";

  let {
    selected = false,
    onpick,
    onreach,
    children,
  }: {
    /** Draws the head and the right edge of the box a selected row is. */
    selected?: boolean;
    onpick?: () => void;
    /** Somewhere to go rather than something to do. */
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
  data-selected={selected ? "" : undefined}
  class="col-start-2 min-w-0 py-3 pl-gutter max-narrow:pl-3.5
    {onpick === undefined ? '' : 'cursor-pointer'}
    {selected
    ? '-mr-3 border-t border-r border-ink pr-3 max-narrow:-mr-2 max-narrow:pr-2'
    : ''}"
>
  {@render children?.()}
</div>
