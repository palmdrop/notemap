<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    onhold,
    onrelease,
    line = $bindable(),
    children,
  }: {
    /** Somebody is at the line: the pointer is over it, or focus is inside it. */
    onhold?: () => void;
    onrelease?: () => void;
    line?: HTMLElement;
    children: Snippet;
  } = $props();

  let hovered = false;
  let focused = false;

  function held(pointer: boolean, focus: boolean) {
    const was = hovered || focused;
    hovered = pointer;
    focused = focus;
    const is = hovered || focused;
    if (is && !was) onhold?.();
    if (!is && was) onrelease?.();
  }

  function left(event: FocusEvent) {
    const into = event.relatedTarget;
    const self = event.currentTarget as HTMLElement;
    if (into instanceof Node && self.contains(into)) return;
    held(hovered, false);
  }
</script>

<!--
  Fixed to the bottom of every surface, as wide as a selected row's box. The
  ground runs the width of the window so nothing scrolls through beside it;
  on a phone the line does too, and its ends are the screen's.
-->
<div class="fixed inset-x-0 bottom-0 z-10 bg-ground px-5 max-narrow:px-0">
  <div
    bind:this={line}
    role="presentation"
    class="relative mx-auto w-full max-w-[calc(var(--spacing-measure)+--spacing(6))] border-x border-t border-ink max-narrow:border-x-0"
    onpointerenter={() => held(true, focused)}
    onpointerleave={() => held(false, focused)}
    onfocusin={() => held(hovered, true)}
    onfocusout={left}
  >
    {@render children()}
  </div>
</div>
