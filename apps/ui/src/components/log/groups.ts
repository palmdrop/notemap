import type { Action, ActionKind, Order } from "@notemap/client";

import { drawable } from "$lib/kinds";

export type Drawn =
  | { readonly kind: "action"; readonly action: Action }
  | {
      readonly kind: "batch";
      readonly id: string;
      /** The entry the group stands in place of: the first of the batch in reading order. */
      readonly at: string;
      /** What opening the group draws, in reading order. */
      readonly entries: readonly Action[];
    };

function inOrder(order: Order): (a: Action, b: Action) => number {
  const way = order === "newest-first" ? -1 : 1;
  return (a, b) => way * (a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/**
 * The rows as the log draws them. Where it groups, a batch is one row, put
 * where its first entry falls in reading order, holding every entry of it the
 * reading's kinds hold, whether the walk has reached them or not.
 */
export function grouped(
  rows: readonly Action[],
  reading: {
    readonly order: Order;
    readonly grouping: boolean;
    readonly kinds?: readonly ActionKind[] | undefined;
    readonly whole: (batch: string) => readonly Action[] | undefined;
  },
): readonly Drawn[] {
  if (!reading.grouping) {
    return rows.map((action) => ({ kind: "action", action }));
  }

  const walked = new Map<string, Action[]>();
  for (const action of rows) {
    if (action.batch === undefined) continue;
    const held = walked.get(action.batch);
    if (held === undefined) walked.set(action.batch, [action]);
    else held.push(action);
  }

  const placed = new Set<string>();
  const drawn: Drawn[] = [];
  for (const action of rows) {
    const id = action.batch;
    if (id === undefined) {
      drawn.push({ kind: "action", action });
      continue;
    }
    if (placed.has(id)) continue;
    placed.add(id);

    const kinds = reading.kinds;
    const entries = new Map<string, Action>();
    for (const one of [
      ...(walked.get(id) ?? []),
      ...(reading.whole(id) ?? []),
    ]) {
      if (!drawable(one.kind)) continue;
      if (kinds !== undefined && !kinds.includes(one.kind)) continue;
      entries.set(one.id, one);
    }

    drawn.push({
      kind: "batch",
      id,
      at: action.at,
      entries: [...entries.values()].sort(inOrder(reading.order)),
    });
  }
  return drawn;
}
