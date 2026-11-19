<script lang="ts">
  import type { Snippet } from "svelte";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";

  /**
   * A page's own bar, docked at the foot of the pane it acts on at every
   * width, with room kept under the page so its last row is never under it.
   * `--pane-left` is where the pane starts: the menu's edge, and settings'
   * list's.
   */
  let {
    label,
    say,
    children,
  }: { label: string; say?: Snippet | undefined; children: Snippet } = $props();
</script>

<div aria-hidden="true" class="h-28"></div>
<div class="fixed right-0 bottom-0 left-(--pane-left,0) z-20">
  <ActionBar {label} {say}>{@render children()}</ActionBar>
</div>
