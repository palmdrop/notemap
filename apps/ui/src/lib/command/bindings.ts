/**
 * The default table, `id → chord`. Nothing writes an override this slice —
 * that wants a settings page — so `chordFor` is the one function such a page
 * would change.
 */
const BINDINGS: Record<string, string> = {
  // An item's own commands: `commandsFor`, drawn by `Actions` where it has a
  // group and reached by a key on every surface that publishes it.
  process: "p",
  manual: "m",
  discard: "D",
  undiscard: "u",
  edit: "e",
  copy: "c",
  open: "o",
  tag: "t",

  // The editable shape's own, published by whatever drew one: the `close`
  // and `save` in its foot, `esc` reaching `close` before anything behind it.
  close: "escape",
  save: "mod+enter",

  // A register's own keyboard: `list.ts`, published by the queue and the feed.
  down: "j",
  up: "k",
  select: "enter",
  deselect: "escape",

  // The queue's and the feed's own: the tags they are read through.
  filter: "f",

  // The capture box's own, while it is selected and the field does not have
  // the caret: the field commits the same chord itself.
  capture: "mod+enter",

  // The process surface's own.
  back: "escape",
  previous: "[",
  next: "]",
  route: "mod+enter",
};

/** The chord a command's id answers to, or nothing where it has none. */
export function chordFor(id: string): string | undefined {
  return BINDINGS[id];
}
