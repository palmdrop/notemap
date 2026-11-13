import type {
  Action,
  Batch,
  BatchAction,
  BatchOutcome,
  RoutingTemplate,
} from "@notemap/client";

import { endingOf } from "./action-log";
import { resultOf, type Ending } from "./batching";
import { drawable, kindWord } from "./kinds";
import type { Raised } from "./notices.svelte";

type Done = "tagged" | "untagged" | "archived" | "unarchived";

const DONE: Readonly<Record<string, Done>> = {
  tagged: "tagged",
  untagged: "untagged",
  archived: "archived",
  unarchived: "unarchived",
};

function text(detail: Action["detail"], key: string): string | undefined {
  const held = detail[key];
  return typeof held === "string" ? held : undefined;
}

/**
 * An entry the batch wrote about the item itself. An `untagged` naming a
 * record is a trigger tag given back, which a reservation of the batch wrote.
 */
function own(action: Action): boolean {
  return (
    Object.hasOwn(DONE, action.kind) &&
    text(action.detail, "record") === undefined
  );
}

function actionOf(entry: Action): BatchAction | undefined {
  const tag = text(entry.detail, "tag");
  switch (entry.kind) {
    case "tagged":
      return tag === undefined ? undefined : { kind: "tag", tag };
    case "untagged":
      return tag === undefined ? undefined : { kind: "untag", tag };
    case "archived":
      return { kind: "archive" };
    case "unarchived":
      return { kind: "unarchive" };
    default:
      return undefined;
  }
}

/** What a template is called, found by its id or by the tag that fires it. */
export type Names = {
  readonly template: (id: string) => string | undefined;
  readonly trigger: (tag: string) => string | undefined;
};

export function namesIn(templates: readonly RoutingTemplate[]): Names {
  return {
    template: (id) => templates.find((one) => one.id === id)?.name,
    trigger: (tag) => templates.find((one) => one.triggerTag === tag)?.name,
  };
}

/**
 * What a batch came to, in the words its notice says it in, from every entry
 * it wrote. Where this client made it and still holds the pool's answer, the
 * answer is what is counted, and the items it refused or skipped with it,
 * which the log never holds.
 */
export function batchSaid(
  entries: readonly Action[],
  held: Batch | undefined,
  names: Names,
): Raised | undefined {
  const inOrder = [...entries].sort((a, b) => a.at.localeCompare(b.at));

  const reserved = new Map<string, string>();
  let fired: string | undefined;
  for (const entry of inOrder) {
    if (entry.kind !== "template-fired" || entry.subject === undefined) {
      continue;
    }
    const record = text(entry.detail, "record");
    if (record !== undefined) reserved.set(entry.subject, record);
    const id = text(entry.detail, "template");
    fired ??=
      (id === undefined ? undefined : names.template(id)) ??
      text(entry.detail, "name");
  }

  const mine = inOrder.filter(own);
  const first = mine[0];
  const action =
    held?.action ?? (first === undefined ? undefined : actionOf(first));
  if (action === undefined) return undefined;

  const template =
    (action.kind === "tag" ? names.trigger(action.tag) : undefined) ?? fired;

  /** Tagged with nothing reserved, under a template, is an item it had already filed. */
  const outcomeOf = (one: Action): BatchOutcome["outcome"] =>
    one.subject !== undefined && reserved.has(one.subject)
      ? "reserved"
      : template !== undefined
        ? "skipped"
        : (DONE[one.kind] ?? "skipped");

  const outcomes: readonly { readonly outcome: BatchOutcome["outcome"] }[] =
    held?.outcomes ??
    [...new Map(mine.map((one) => [one.subject, one])).values()].map((one) => ({
      outcome: outcomeOf(one),
    }));

  const endedBy = new Map<string, Ending>();
  for (const entry of inOrder) {
    const ended = endingOf(entry);
    if (ended?.ending !== undefined) endedBy.set(ended.record, ended.ending);
  }
  const records = new Set(
    held?.outcomes === undefined
      ? reserved.values()
      : held.outcomes.flatMap((one) =>
          one.outcome === "reserved" ? [one.record] : [],
        ),
  );
  const endings = [...records].map((record) => endedBy.get(record));

  return resultOf(action, template, outcomes, endings);
}

/** What the log holds of a batch, counted by kind, where nothing says what the batch did. */
export function byKind(entries: readonly Action[]): Raised | undefined {
  const counted = new Map<string, number>();
  for (const entry of entries) {
    if (!drawable(entry.kind)) continue;
    const word = kindWord(entry.kind);
    counted.set(word, (counted.get(word) ?? 0) + 1);
  }
  if (counted.size === 0) return undefined;
  return {
    what: [...counted].map(([word, n]) => `${String(n)} ${word}`).join(", "),
  };
}
