<script lang="ts">
  import type { Snippet } from "svelte";

  import { pickable } from "$lib/pick";

  let {
    first = false,
    lit = false,
    onpick,
    children,
  }: {
    first?: boolean;
    lit?: boolean;
    onpick?: () => void;
    children: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onpick === undefined ? undefined : pickable(onpick)}
  class="col-start-2 min-w-0 border-t border-l-2 border-t-ink/20
    {first ? 'border-t-0 pt-3.5 pb-6' : 'py-6'}
    {onpick === undefined ? '' : 'cursor-pointer'}
    {lit ? 'border-l-accent bg-ink/5 pl-3.5' : 'border-l-transparent'}"
>
  {@render children()}
</div>
