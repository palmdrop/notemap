<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    onhold,
    onrelease,
    children,
  }: {
    /** Somebody is at the corner: the pointer is over it, or focus is inside it. */
    onhold?: () => void;
    onrelease?: () => void;
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

<!-- The left corner, because the right is where a composer lives. -->
<div
  role="presentation"
  class="fixed bottom-4 left-4 z-10 grid max-w-84 gap-3"
  onpointerenter={() => held(true, focused)}
  onpointerleave={() => held(false, focused)}
  onfocusin={() => held(hovered, true)}
  onfocusout={left}
>
  {@render children()}
</div>
