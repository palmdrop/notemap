import type { Command } from "./command";

/**
 * A register's own keyboard: walking it with `down`/`up`, stepping into a row
 * or past it with `select`, and leaving one with `deselect`. Generic over how
 * a surface does each — the queue and the feed already have their own
 * stepping, selecting and deselecting, and this only names the four of them
 * as commands a chord can reach.
 */
export type ListSurroundings = {
  readonly ondown: () => void;
  readonly onup: () => void;
  readonly onselect: () => void;
  readonly ondeselect: () => void;
};

export function listCommands(at: ListSurroundings): readonly Command[] {
  return [
    { id: "down", label: "next row", run: at.ondown },
    { id: "up", label: "previous row", run: at.onup },
    { id: "select", label: "select or process", run: at.onselect },
    { id: "deselect", label: "deselect", run: at.ondeselect },
  ];
}

/**
 * Marking rows for a batch, published beside the four: `space` marks or
 * unmarks the selected row, and a held `shift` walks a range. Leaving the mode
 * is `deselect`'s, which clears what is marked before it lets go of a row.
 */
export function markCommands(at: {
  readonly selected: string | undefined;
  readonly marking: { toggle(id: string): void };
  readonly onextend: (step: 1 | -1) => void;
}): readonly Command[] {
  const selected = at.selected;
  return [
    ...(selected === undefined
      ? []
      : [
          {
            id: "mark",
            label: "mark",
            run: () => at.marking.toggle(selected),
          },
        ]),
    { id: "mark-down", label: "mark the next row", run: () => at.onextend(1) },
    {
      id: "mark-up",
      label: "mark the previous row",
      run: () => at.onextend(-1),
    },
  ];
}
