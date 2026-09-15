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
