<script lang="ts" module>
  /** Whether the bar an action sits in is drawn short, over the keyboard. */
  export const SHORT = Symbol("short bar");
</script>

<script lang="ts">
  import { setContext, type Snippet } from "svelte";
  import { on } from "svelte/events";

  import { keyboard } from "$lib/keyboard.svelte";
  import { fade } from "$lib/motion";

  /**
   * The actions of a page, docked at its foot under a rule at every width:
   * where the thumb is on a phone, and out of the way of what is read when
   * wide, where it stands the height of the menu's foot so the two rules
   * are one line.
   * `say` is the ruled line over the bar: why the main action cannot be
   * taken yet, or what the page just did. With the keyboard up it is one
   * short row, the main action small at the right and the others icons, so
   * the words keep the room.
   */
  let {
    say,
    label = "Actions",
    children,
  }: {
    say?: Snippet | undefined;
    label?: string;
    children: Snippet;
  } = $props();

  setContext(SHORT, () => keyboard.up);

  // Pressed with the keyboard up, the field keeps the focus until the action
  // has run: losing it would grow the bar under the finger.
  function keepFocus(bar: HTMLElement): () => void {
    return on(bar, "mousedown", (event) => {
      if (keyboard.up) event.preventDefault();
    });
  }
</script>

<div data-bar="foot" class="sticky bottom-0 z-10">
  {#if say !== undefined}
    <p
      transition:fade
      class="border-t border-rule bg-paper px-gutter py-2 text-small text-muted empty:hidden"
    >
      {@render say()}
    </p>
  {/if}
  <div
    role="toolbar"
    aria-label={label}
    {@attach keepFocus}
    class="flex w-full gap-2 border-t border-rule bg-off px-gutter wide:h-foot wide:items-center wide:py-0 {keyboard.up
      ? 'items-center py-1'
      : 'items-stretch pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]'}"
  >
    {@render children()}
  </div>
</div>
