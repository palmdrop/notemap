import type { Action } from "@notemap/client";

import type { Raised } from "./notices.svelte";
import { keyFor } from "./routing";

/**
 * The kinds worth saying to somebody who did not ask. Everything else the log
 * holds stays in the log, which is what it is for.
 */
const SAID: ReadonlySet<string> = new Set([
  "routed",
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

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
    /** Where the whole of it can be read. */
    about: (item: string) => string;
  },
): Raised | undefined {
  if (!SAID.has(action.kind)) return undefined;

  const detail = action.detail as Record<string, unknown>;
  const record = stringAt(detail, "record");
  const named = place(detail, said.nameOf);
  const href =
    action.subject === undefined ? undefined : said.about(action.subject);
  const where = href === undefined ? {} : { href };

  if (action.kind === "routed") {
    const pointer = stringAt(detail, "pointer");
    return {
      what: named === undefined ? "marked processed" : `routed · ${named}`,
      ...(pointer === undefined ? {} : { why: pointer }),
      ...where,
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
