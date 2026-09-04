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
    children: Snippet;
  } = $props();
</script>

<!-- The stamp inside is the accessible way in; this is only reach. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  ondblclick={onreach === undefined ? undefined : doubled(onreach)}
  class="col-start-1 min-w-0 border-t border-t-ink/20 font-mono group-data-furled:hidden
    {first ? 'border-t-0 pt-3.5 pb-6' : 'py-6'}
    {onpick === undefined ? '' : 'cursor-pointer'}
    {lit ? '-ml-3.5 bg-ink/5 pl-3.5' : ''}"
>
  {@render children()}
</div>
