import {
  unprocessed,
  type BatchAction,
  type BatchOutcome,
  type Item,
} from "@notemap/client";

import type { Raised } from "./notices.svelte";

export function notes(count: number): string {
  return count === 1 ? "1 note" : `${String(count)} notes`;
}

/**
 * What the confirm step counts, from the rows this shell holds: how many the
 * batch will skip, and how many are already processed and would be processed
 * again. The pool's answer is what the result says; this is what is asked.
 */
export type Counted = {
  readonly total: number;
  readonly skipped: number;
  readonly again: number;
};

export function counted(items: readonly Item[], action: BatchAction): Counted {
  let skipped = 0;
  let again = 0;
  for (const item of items) {
    const done =
      action.kind === "archive"
        ? item.archived !== undefined
        : (item.routing?.templates ?? []).includes(action.template);
    if (done) skipped += 1;
    else if (!unprocessed(item)) again += 1;
  }
  return { total: items.length, skipped, again };
}

/** The confirm step's question, and the lines under it that say what it will not do as asked. */
export function asking(
  count: Counted,
  action: BatchAction,
  name: string | undefined,
): { readonly question: string; readonly notes: readonly string[] } {
  const archive = action.kind === "archive";
  const question = archive
    ? `discard ${notes(count.total)}?`
    : `route ${notes(count.total)} with ${name ?? "a template"}?`;

  const said: string[] = [];
  if (count.skipped > 0) {
    said.push(
      archive
        ? `${String(count.skipped)} already discarded, and left as they are`
        : `${String(count.skipped)} already filed by it, and left as they are`,
    );
  }
  if (count.again > 0) {
    said.push(
      archive
        ? `${String(count.again)} already processed`
        : `${String(count.again)} already processed, and filed again`,
    );
  }
  return { question, notes: said };
}

/** How each record a batch reserved ended, as the log said. */
export type Ending = "routed" | "failed" | "cancelled";

/**
 * A batch's one notice, once every item in it has settled: what came of it,
 * counted, and in the accent where anything went wrong.
 */
export function resultOf(
  action: BatchAction,
  name: string | undefined,
  outcomes: readonly BatchOutcome[],
  endings: readonly Ending[],
): Raised {
  const refused = outcomes.filter((one) => one.outcome === "refused").length;
  const skipped = outcomes.filter((one) => one.outcome === "skipped").length;
  const archived = outcomes.filter((one) => one.outcome === "archived").length;
  const routed = endings.filter((one) => one === "routed").length;
  const failed = endings.filter((one) => one === "failed").length;
  const cancelled = endings.filter((one) => one === "cancelled").length;

  const counts: readonly [number, string][] =
    action.kind === "archive"
      ? [
          [archived, "discarded"],
          [skipped, "already discarded"],
          [refused, "refused"],
        ]
      : [
          [routed, "filed"],
          [failed, "failed"],
          [cancelled, "cancelled"],
          [skipped, "already filed"],
          [refused, "refused"],
        ];
  const why = counts
    .filter(([count]) => count > 0)
    .map(([count, said]) => `${String(count)} ${said}`)
    .join(", ");

  return {
    what:
      action.kind === "archive"
        ? `${notes(outcomes.length)} discarded`
        : `${notes(outcomes.length)} routed`,
    ...(action.kind === "template" && name !== undefined
      ? { subject: name }
      : {}),
    ...(why === "" ? {} : { why }),
    ...(failed + refused > 0 ? { alarm: true } : {}),
  };
}
