import { SvelteSet } from "svelte/reactivity";

/** How a row was picked: with `mod` held, with `shift` held, or plainly. */
export type Picked = {
  readonly toggle: boolean;
  readonly range: boolean;
};

export const PLAINLY: Picked = { toggle: false, range: false };

export function pickedBy(event: MouseEvent | KeyboardEvent): Picked {
  return { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey };
}

/**
 * The rows a surface has marked for a batch. Marking is a mode: entered by a
 * pick with `mod` or `shift` held, or by `space`, and on for as long as
 * anything is marked, so a plain pick while it is on marks rather than
 * starting over.
 */
export class Marking {
  readonly #marked = new SvelteSet<string>();
  /** Where a range starts: the row last marked or unmarked by itself. */
  #anchor = $state<string | undefined>(undefined);
  get on(): boolean {
    return this.#marked.size > 0;
  }

  get count(): number {
    return this.#marked.size;
  }

  has(id: string): boolean {
    return this.#marked.has(id);
  }

  /** The marked rows, in the order they are drawn, so a batch reads as the surface does. */
  inOrder(rows: readonly { readonly id: string }[]): readonly string[] {
    return rows.map((row) => row.id).filter((id) => this.#marked.has(id));
  }

  toggle(id: string): void {
    if (this.#marked.has(id)) this.#marked.delete(id);
    else this.#marked.add(id);
    this.#anchor = id;
  }

  mark(id: string): void {
    this.#marked.add(id);
    this.#anchor ??= id;
  }

  /** Every row from the anchor to this one, inclusive, added to what is marked. */
  range(rows: readonly string[], to: string, from = this.#anchor ?? to): void {
    const one = rows.indexOf(from);
    const other = rows.indexOf(to);
    if (other === -1) return;
    const start = one === -1 ? other : Math.min(one, other);
    const end = one === -1 ? other : Math.max(one, other);
    for (const id of rows.slice(start, end + 1)) this.#marked.add(id);
    this.#anchor ??= from;
  }

  /** Lets go of rows no longer drawn, so a count never says more than is there. */
  keepOnly(rows: readonly string[]): void {
    for (const id of [...this.#marked]) {
      if (!rows.includes(id)) this.#marked.delete(id);
    }
    if (this.#anchor !== undefined && !rows.includes(this.#anchor)) {
      this.#anchor = undefined;
    }
  }

  clear(): void {
    this.#marked.clear();
    this.#anchor = undefined;
  }
}

/**
 * What a pick does to a surface that may be marking: whether it marks, and
 * which row it leaves selected. A plain pick outside the mode is the surface's
 * own, and is answered `undefined`.
 */
export function picked(
  marking: Marking,
  rows: readonly string[],
  id: string,
  how: Picked,
  selected: string | undefined,
): string | undefined {
  if (how.range) {
    marking.range(rows, id, marking.on ? undefined : (selected ?? id));
    return id;
  }
  if (how.toggle || marking.on) {
    // A row already selected when the mode is entered is the first one marked:
    // the person was already pointing at it.
    if (!marking.on && selected !== undefined && selected !== id) {
      marking.mark(selected);
    }
    marking.toggle(id);
    return id;
  }
  return undefined;
}
