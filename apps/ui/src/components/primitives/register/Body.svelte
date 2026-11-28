<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Picked } from "$lib/marking.svelte";
  import { doubled, pickable, unselecting } from "$lib/pick";

  let {
    selected = false,
    onpick,
    onreach,
    gap = false,
    aside,
    children,
  }: {
    /** Draws the head and the right edge of the box a selected row is. */
    selected?: boolean;
    onpick?: (how: Picked) => void;
    /** Somewhere to go rather than something to do. */
    onreach?: () => void;
    /** More than half a day passed before this row: the index's gap, opened here. */
    gap?: boolean;
    /** Beside the words when wide, at the end of their measure: a hovered row's Route. */
    aside?: Snippet;
    /** Absent where the row is all rail: the cell still holds the column open. */
    children?: Snippet;
  } = $props();
</script>

<!-- The words keep a readable measure; what sits beside them sits at its
     end rather than at the window's edge. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  onmousedown={onpick === undefined ? undefined : unselecting}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-body
  data-selected={selected ? "" : undefined}
  class="col-start-2 flex min-w-0 gap-4 py-4 pr-gutter
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(4)+var(--spacing-gap-time))]' : ''}"
>
  <div class="flex max-w-measure min-w-0 flex-1 flex-col gap-3">
    {@render children?.()}
  </div>
  {#if aside !== undefined}
    <div class="hidden w-52 flex-none wide:block">{@render aside()}</div>
  {/if}
</div>
