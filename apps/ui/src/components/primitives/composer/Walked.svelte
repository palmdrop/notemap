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
   * `on` is the row the walk has landed on; `held` is the row whose value the
   * field already holds. They are drawn differently and are independent — the
   * walk can pass over the one already taken.
   */
  let {
    id,
    on = false,
    held = false,
    dim = false,
    disabled = false,
    indent = 0,
    ontake,
    children,
  }: {
    /** Set only on the row the walk is on, which is what the line points at. */
    id?: string;
    on?: boolean;
    held?: boolean;
    /** Neither walked nor held nor on the path: present, and not what the eye is for. */
    dim?: boolean;
    disabled?: boolean;
    /** Depth in a hierarchy, in list steps. Flat lists leave it at zero. */
    indent?: number;
    ontake: () => void;
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
  class="cursor-default {on
    ? 'inverted'
    : held
      ? 'text-accent'
      : dim
        ? 'text-ink-muted'
        : 'text-ink'}"
  onmousedown={(event) => {
    event.preventDefault();
    if (!disabled) ontake();
  }}
>
  {@render children()}
</div>
