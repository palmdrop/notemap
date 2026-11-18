<script lang="ts">
  import type { Snippet } from "svelte";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";

  /**
   * A page's own bar. On a phone, docked at the foot of the screen, with room
   * kept under the page so its last row is never under it; when wide, a
   * toolbar at the head of the page, which sets it first in its column.
   */
  let {
    label,
    say,
    children,
  }: { label: string; say?: Snippet | undefined; children: Snippet } = $props();
</script>

<div aria-hidden="true" class="h-28 wide:hidden"></div>
<div
  class="max-wide:fixed max-wide:inset-x-0 max-wide:bottom-0 max-wide:z-20 wide:order-first"
>
  <ActionBar {label} {say} plain>{@render children()}</ActionBar>
</div>
