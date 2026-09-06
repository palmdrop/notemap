import type { Action } from "@notemap/client";

import type { Raised } from "./notices.svelte";
import { keyFor } from "./routing";

/**
 * The kinds worth saying to somebody who did not ask. Everything else the log
 * holds stays in the log, which is what it is for.
 */
const SAID: ReadonlySet<string> = new Set([
  "routed",
  "template-fired",
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

/**
 * One at a time, and it stands. A tag files an item in one keystroke, so a
 * corner stacking four of these while a queue is worked is not the quiet thing
 * it is meant to be — and the cancel is the only thing between a mistyped tag
 * and somebody's vault, so it may not linger away while nobody is looking.
 */
const FIRED = "fired";

function stringAt(
  detail: Record<string, unknown>,
  key: string,
): string | undefined {
  const held = detail[key];
  return typeof held === "string" ? held : undefined;
}

function failureIn(detail: Record<string, unknown>): string | undefined {
  const failure = detail["failure"];
  if (typeof failure !== "object" || failure === null) return undefined;

  const held = failure as Record<string, unknown>;
  const code = stringAt(held, "code");
  const said = stringAt(held, "detail");

  if (code === undefined) return said;
  return said === undefined ? code : `${code} · ${said}`;
}

function place(
  detail: Record<string, unknown>,
  nameOf: (destination: string) => string,
): string | undefined {
  const destination = stringAt(detail, "destination");
  return destination === undefined ? undefined : nameOf(destination);
}

/** Whether the tag filed this, rather than a person taking the template themselves. */
function firedByTag(detail: Record<string, unknown>): boolean {
  return detail["firedByTag"] === true;
}

/**
 * What an entry in the log is worth saying in the corner, or nothing. The key
 * is the record rather than the entry: a delivery retried four times is one
 * thing that went wrong, and a landing this shell already reported is the same
 * fact arriving twice.
 */
export function noticeOf(
  action: Action,
  said: {
    nameOf: (destination: string) => string;
    /** A template's name, for the two entries a fired one produces. */
    templateOf?: (template: string) => string;
    /** Where the whole of it can be read. */
    about: (item: string) => string;
    /** Called off within the window. Absent where nothing here can cancel. */
    cancel?: (record: string, item: string) => void;
  },
): Raised | undefined {
  if (!SAID.has(action.kind)) return undefined;

  const detail = action.detail as Record<string, unknown>;
  const record = stringAt(detail, "record");
  const named = place(detail, said.nameOf);
  const href =
    action.subject === undefined ? undefined : said.about(action.subject);
  const where = href === undefined ? {} : { href };

  const template = stringAt(detail, "template");
  const called =
    template === undefined ? undefined : (said.templateOf?.(template) ?? named);

  /**
   * The window a fired template waits out, and the whole of its visibility: no
   * countdown and no bar, because the notice may not claim the item was filed
   * anywhere before anything has been written.
   */
  if (action.kind === "template-fired") {
    const subject = action.subject;
    const cancel = said.cancel;
    const offered =
      record === undefined || subject === undefined || cancel === undefined
        ? {}
        : { offer: { label: "cancel", take: () => cancel(record, subject) } };

    return {
      what: `routing · ${called ?? stringAt(detail, "name") ?? "a template"}`,
      ...where,
      standing: true,
      only: FIRED,
      ...offered,
    };
  }

  if (action.kind === "routed") {
    const pointer = stringAt(detail, "pointer");
    const fired = firedByTag(detail);

    return {
      what:
        named === undefined
          ? "marked processed"
          : `routed · ${fired ? (called ?? named) : named}`,
      ...(pointer === undefined ? {} : { why: pointer }),
      ...where,
      // It replaces the `routing` notice it resolves, and stands in its place:
      // there is one at a time, and the window closing is worth seeing.
      ...(fired ? { standing: true, only: FIRED } : {}),
      ...(record === undefined ? {} : { key: keyFor(record) }),
    };
  }

  if (action.kind === "delivery-failed") {
    const why = failureIn(detail);
    return {
      what:
        named === undefined ? "delivery failed" : `delivery failed · ${named}`,
      ...(why === undefined ? {} : { why }),
      ...where,
      standing: true,
      ...(record === undefined ? {} : { key: `failed:${record}` }),
    };
  }

  /**
   * Giving up on a delivery removes its reservation, so the item is work again.
   * That is the half of this a person cannot see anywhere else: the row came
   * back on its own and nothing else would say why.
   */
  if (action.kind === "work-abandoned") {
    return {
      what: "given up",
      why: record === undefined ? failureIn(detail) : "back in the queue",
      ...where,
      standing: true,
      key: `abandoned:${record ?? action.id}`,
    };
  }

  const why = failureIn(detail);
  return {
    what: "work failed",
    ...(why === undefined ? {} : { why }),
    ...where,
    standing: true,
    key: `work:${action.id}`,
  };
}
