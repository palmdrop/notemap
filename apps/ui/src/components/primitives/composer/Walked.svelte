<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One row of a list a **line** walks, as opposed to one a pointer clicks.
   *
   * Not `Option`, and the difference is the focus: `Option` is a `<button>`, so
   * taking one moves focus onto it. A control whose `↑↓` walk is published
   * through `aria-activedescendant` needs the caret to stay in its input, which
   * is why this is a `div` taken on `mousedown` with the default prevented.
   *
   * `on` is the row the walk has landed on, bold, with `aria-selected`; `along`
   * is bold too but carries no selection — the trail the line names, drawn down
   * to the note; `held` is the row whose value the field already holds,
   * underlined. All three are independent: the walk can pass over a row that is
   * held, or sit on one that is not on the trail at all.
   */
  let {
    id,
    on = false,
    along = false,
    held = false,
    disabled = false,
    indent = 0,
    ontake,
    onhover,
    children,
  }: {
    /** Set only on the row the walk is on, which is what the line points at. */
    id?: string;
    on?: boolean;
    /** The trail the line names, bold independent of `on`. */
    along?: boolean;
    held?: boolean;
    disabled?: boolean;
    /** Depth in a hierarchy, in list steps. Flat lists leave it at zero. */
    indent?: number;
    ontake: () => void;
    /** The pointer entering the row, for a chooser the mouse marks as it moves. */
    onhover?: () => void;
    children: Snippet;
  } = $props();
</script>

<div
  {id}
  role="option"
  tabindex="-1"
  aria-selected={on}
  aria-disabled={disabled ? "true" : undefined}
  style={indent === 0 ? undefined : `padding-left: ${indent * 1.1}rem`}
  class="cursor-default {on || along ? 'font-semibold' : ''} {held
    ? 'underline'
    : ''}"
  onmousedown={(event) => {
    event.preventDefault();
    if (!disabled) ontake();
  }}
  onmouseenter={onhover}
>
  {@render children()}
</div>
