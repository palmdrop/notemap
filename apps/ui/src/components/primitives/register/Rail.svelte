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
    children: Snippet;
  } = $props();

  let cell = $state<HTMLElement | undefined>(undefined);

  /** Brings the row into view, for the keys that walk the list. */
  export function reveal(): void {
    cell?.scrollIntoView({ block: "nearest" });
  }
</script>

<!-- The stamp inside is the accessible way in; this is only reach. The box
     reaches outside the column so the text inside it does not move when it
     appears. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cell}
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  data-selected={selected ? "" : undefined}
  class="col-start-1 min-w-0 border-r border-ink pr-4 pb-3 max-narrow:pr-2.5
    {onpick === undefined ? '' : 'cursor-pointer'}
    {gap ? 'pt-[calc(--spacing(3)+var(--spacing-gap-time))]' : 'pt-3'}
    {selected
    ? '-ml-3 border-t border-l pl-3 max-narrow:-ml-2 max-narrow:pl-2'
    : ''}"
>
  {@render children()}
</div>
