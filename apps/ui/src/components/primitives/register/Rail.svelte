<script lang="ts">
  import type { Snippet } from "svelte";

  import Gutter from "$components/primitives/marks/Gutter.svelte";
  import type { Picked } from "$lib/marking.svelte";
  import { doubled, pickable, unselecting } from "$lib/pick";

  let {
    selected = false,
    marked = false,
    cursor = false,
    onpick,
    onreach,
    gap = false,
    children,
  }: {
    /** Draws the head and the left edge of the box a selected row is. */
    selected?: boolean;
    /** Marked for a batch, with the gutter's bar. */
    marked?: boolean;
    /** Where the keys are while rows are being marked. */
    cursor?: boolean;
    onpick?: (how: Picked) => void;
    /** Somewhere to go rather than something to do. */
    onreach?: () => void;
    /** More than half a day passed before this row: the index's gap, opened here. */
    gap?: boolean;
    /** Absent where nothing is known yet to put in it: the rule still runs. */
    children?: Snippet;
  } = $props();
</script>

<!-- The stamp inside is the accessible way in; this is only reach. The box's
     edges are drawn on every row and coloured on the selected one, so the
     text inside it does not move by a pixel when it appears. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  onmousedown={onpick === undefined ? undefined : unselecting}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-rail
  data-selected={selected ? "" : undefined}
  class="relative col-start-1 min-w-0 py-4 pl-gutter text-time
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(4)+var(--spacing-gap-time))]' : ''}"
>
  <Gutter {marked} {cursor} />
  {@render children?.()}
</div>
