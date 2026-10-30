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

/** `template` is the one a tag applies, where it applies one. */
export function counted(
  items: readonly Item[],
  action: BatchAction,
  template?: string,
): Counted {
  let skipped = 0;
  let again = 0;
  for (const item of items) {
    const done =
      action.kind === "archive"
        ? item.archived !== undefined
        : template !== undefined &&
          (item.routing?.templates ?? []).includes(template);
    if (done) skipped += 1;
    else if (!unprocessed(item)) again += 1;
  }
  return { total: items.length, skipped, again };
}

/**
 * The confirm step's question, and the lines under it that say what it will
 * not do as asked. Only a batch that processes is asked about: a discard, or a
 * tag that applies a template, named here with where its values put the items.
 */
export function asking(
  count: Counted,
  action: BatchAction,
  name: string | undefined,
  where?: string,
): { readonly question: string; readonly notes: readonly string[] } {
  const archive = action.kind === "archive";
  const question = archive
    ? `discard ${notes(count.total)}?`
    : `route ${notes(count.total)} with ${name ?? "a template"}${
        where === undefined ? "" : `, ${where}`
      }?`;

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

/** The words a batch is said in: what was done, and what the outcomes count as. */
function wordsFor(
  action: BatchAction,
  routing: boolean,
): {
  readonly done: string;
  readonly changed: string;
  readonly already: string;
} {
  switch (action.kind) {
    case "tag":
      return routing
        ? { done: "routed", changed: "filed", already: "already filed" }
        : { done: "tagged", changed: "tagged", already: "already tagged" };
    case "untag":
      return { done: "untagged", changed: "untagged", already: "not tagged" };
    case "archive":
      return {
        done: "discarded",
        changed: "discarded",
        already: "already discarded",
      };
    case "unarchive":
      return {
        done: "undiscarded",
        changed: "undiscarded",
        already: "not discarded",
      };
  }
}

/**
 * A batch's one notice, once every item in it has settled: what came of it,
 * counted, and in the accent where anything went wrong. `template` is the name
 * of the one a tag applied, where it applied one.
 */
export function resultOf(
  action: BatchAction,
  template: string | undefined,
  outcomes: readonly BatchOutcome[],
  endings: readonly Ending[],
): Raised {
  const routing =
    action.kind === "tag" &&
    (template !== undefined ||
      outcomes.some((one) => one.outcome === "reserved"));
  const words = wordsFor(action, routing);
  const count = (outcome: BatchOutcome["outcome"]) =>
    outcomes.filter((one) => one.outcome === outcome).length;
  const refused = count("refused");
  const failed = endings.filter((one) => one === "failed").length;
  const changed = routing
    ? endings.filter((one) => one === "routed").length
    : outcomes.length - refused - count("skipped");

  const counts: readonly [number, string][] = [
    [changed, words.changed],
    [failed, "failed"],
    [endings.filter((one) => one === "cancelled").length, "cancelled"],
    [count("skipped"), words.already],
    [refused, "refused"],
  ];
  const why = counts
    .filter(([n]) => n > 0)
    .map(([n, said]) => `${String(n)} ${said}`)
    .join(", ");

  const subject = routing
    ? template
    : action.kind === "tag" || action.kind === "untag"
      ? action.tag
      : undefined;

  return {
    what: `${notes(outcomes.length)} ${words.done}`,
    ...(subject === undefined ? {} : { subject }),
    ...(why === "" ? {} : { why }),
    ...(failed + refused > 0 ? { alarm: true } : {}),
  };
}
