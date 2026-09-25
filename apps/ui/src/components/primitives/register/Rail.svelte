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
    /** Draws the head and the left edge of the box a selected row is. */
    selected?: boolean;
    onpick?: () => void;
    /** Somewhere to go rather than something to do. */
    onreach?: () => void;
    /** More than half a day passed before this row: the index's gap, opened here. */
    gap?: boolean;
    /** Absent where nothing is known yet to put in it: the rule still runs. */
    children?: Snippet;
  } = $props();

  let cell = $state<HTMLElement | undefined>(undefined);

  /** Brings the row into view, for the keys that walk the list. */
  export function reveal(): void {
    cell?.scrollIntoView({ block: "nearest" });
  }
</script>

<!-- The stamp inside is the accessible way in; this is only reach. The box's
     edges are drawn on every row and coloured on the selected one, so the
     text inside it does not move by a pixel when it appears. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cell}
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-selected={selected ? "" : undefined}
  class="col-start-1 -ml-3 min-w-0 border-t border-r border-l border-ink pr-4 pb-3 pl-3 max-narrow:-ml-2 max-narrow:pr-2.5 max-narrow:pl-2
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(3)+var(--spacing-gap-time))]' : 'pt-3'}
    {selected ? '' : 'border-t-transparent border-l-transparent'}"
>
  {@render children?.()}
</div>
