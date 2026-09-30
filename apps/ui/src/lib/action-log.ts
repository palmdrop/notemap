import type { Action } from "@notemap/client";

import type { Firing } from "./firings.svelte";
import type { Raised } from "./notices.svelte";
import { keyFor } from "./routing";

/**
 * The kinds worth saying to somebody who did not ask. Everything else the log
 * holds stays in the log, which is what it is for.
 */
const SAID: ReadonlySet<string> = new Set([
  "routed",
  "delivery-cancelled",
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

/** Everything that ends a firing: it landed, failed, was given up on, or called off. */
const ENDS: ReadonlySet<string> = new Set([
  "routed",
  "delivery-cancelled",
  "delivery-failed",
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

/** Whether the tag filed this, rather than a person taking the template themselves. */
function firedByTag(detail: Record<string, unknown>): boolean {
  return detail["firedByTag"] === true;
}

/**
 * One run of attempts at one record reads as one notice, the last word taking
 * the place of the ones before it.
 */
function runOf(record: string | undefined): { only?: string } {
  return record === undefined ? {} : { only: `delivery:${record}` };
}

/**
 * What an entry in the log does to the routes a trigger tag has in flight: a
 * `template-fired` opens one, and an entry that ends it closes it.
 */
export function firingOf(
  action: Action,
  said: {
    /** A template's name where it is known, falling back to the one the entry carries. */
    templateOf?: (template: string) => string | undefined;
    about: (item: string) => string;
  },
): { readonly opened: Firing } | { readonly closed: string } | undefined {
  const detail = action.detail as Record<string, unknown>;
  const record = stringAt(detail, "record");
  if (record === undefined) return undefined;

  if (ENDS.has(action.kind)) return { closed: record };
  if (action.kind !== "template-fired" || action.subject === undefined) {
    return undefined;
  }

  const template = stringAt(detail, "template");
  const until = stringAt(detail, "until");
  return {
    opened: {
      record,
      item: action.subject,
      name:
        (template === undefined ? undefined : said.templateOf?.(template)) ??
        stringAt(detail, "name") ??
        "a template",
      href: said.about(action.subject),
      ...(until === undefined ? {} : { until: Date.parse(until) }),
    },
  };
}

/**
 * What an entry in the log is worth saying in the status line, or nothing. The key
 * is the record rather than the entry: a delivery retried four times is one
 * thing that went wrong, and a landing this shell already reported is the same
 * fact arriving twice.
 */
export function noticeOf(
  action: Action,
  said: {
    nameOf: (destination: string) => string;
    /** A template's name where it is known, for the entries a fired one produces. */
    templateOf?: (template: string) => string | undefined;
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

  const template = stringAt(detail, "template");
  const called =
    template === undefined ? undefined : (said.templateOf?.(template) ?? named);

  /** A route called off, said briefly: the firing it ends is closed beside it. */
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
      ...runOf(record),
      ...(record === undefined ? {} : { key: `failed:${record}` }),
    };
  }

  /**
   * Giving up on a delivery removes its reservation, so the item is work again.
   * That is the half of this a person cannot see anywhere else: the row came
   * back on its own and nothing else would say why. It takes the place of the
   * failure it ends, so it carries that failure's reason as well.
   */
  if (action.kind === "work-abandoned") {
    const at = firedByTag(detail) ? (called ?? named) : named;
    const why = [
      failureIn(detail),
      record === undefined ? undefined : "back in the queue",
    ].filter((part) => part !== undefined);

    return {
      what: at === undefined ? "given up" : `given up · ${at}`,
      ...(why.length === 0 ? {} : { why: why.join(" · ") }),
      ...where,
      standing: true,
      ...runOf(record),
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
