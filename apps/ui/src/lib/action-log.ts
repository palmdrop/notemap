import type { Action } from "@notemap/client";

import type { Raised } from "./notices.svelte";
import { firedKey, keyFor } from "./routing";

/**
 * The kinds worth saying to somebody who did not ask. Everything else the log
 * holds stays in the log, which is what it is for.
 */
const SAID: ReadonlySet<string> = new Set([
  "routed",
  "template-fired",
  "delivery-cancelled",
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

/**
 * One at a time, and it stands. A tag files an item in one keystroke, so a
 * corner stacking four of these while a queue is worked is not the quiet thing
 * it is meant to be — and the cancel is the only thing between a mistyped tag
 * and somebody's vault, so it may not linger away while nobody is looking.
 *
 * Everything that **ends** a firing carries the same name, so it takes the
 * notice's place rather than standing beside it: a delivery that landed, one
 * that failed, one given up on, and a cancellation. A `routing · research` left
 * up after the route is over says something untrue and offers a cancel that
 * would refuse.
 */
export const FIRED = "fired";

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
      // Nothing has gone wrong: it stands so the cancel does not time out.
      alarm: false,
      only: FIRED,
      // The shell says this itself the moment it tags, so the log arriving with
      // the same news says nothing.
      ...(record === undefined ? {} : { key: firedKey(record) }),
      ...offered,
    };
  }

  /**
   * A route called off. Said briefly and under the firing's own name, so the
   * notice it ends goes with it — including when the cancel came from somewhere
   * other than that notice.
   */
  if (action.kind === "delivery-cancelled") {
    const gave = stringAt(detail, "tag");

    return {
      what:
        stringAt(detail, "target") === "user"
          ? "manual mark undone"
          : "routing cancelled",
      ...(gave === undefined ? {} : { why: `${gave} taken back` }),
      ...where,
      alarm: false,
      ...(template === undefined ? {} : { only: FIRED }),
      ...(record === undefined ? {} : { key: `cancelled:${record}` }),
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
      // there is one at a time, and the window closing is worth seeing. Nothing
      // went wrong, so it is not drawn as though something had.
      ...(fired ? { standing: true, alarm: false, only: FIRED } : {}),
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
      // It ends the firing it was the attempt of, so it takes that notice's
      // place: two notices, one saying it is on its way and one saying it
      // failed, is the corner contradicting itself.
      ...(firedByTag(detail) ? { only: FIRED } : {}),
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
      ...(firedByTag(detail) ? { only: FIRED } : {}),
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
