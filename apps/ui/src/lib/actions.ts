import type { Agent } from "@notemap/client";

export type Pair = { readonly key: string; readonly value: string };

/** The kinds the accent is spent on, and the whole of them. */
const FAILURES: ReadonlySet<string> = new Set([
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

export function failed(kind: string): boolean {
  return FAILURES.has(kind);
}

/** The refusal's own name, wherever the flattening put it. */
export function isCode(key: string): boolean {
  return key === "code" || key.endsWith(".code");
}

/** Strings unquoted: `detail` carries facts, and a quote is not one of them. */
function scalar(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nested(value: unknown): boolean {
  return isObject(value) || Array.isArray(value);
}

function into(pairs: Pair[], key: string, value: unknown): void {
  if (isObject(value)) {
    for (const [name, held] of Object.entries(value)) {
      into(pairs, key === "" ? name : `${key}.${name}`, held);
    }
    return;
  }

  if (Array.isArray(value)) {
    // One value while it holds only scalars; a column of numbered rows once it
    // does not, since a joined object says nothing.
    if (value.some(nested)) {
      value.forEach((held, at) => {
        into(pairs, `${key}.${String(at)}`, held);
      });
    } else if (value.length > 0) {
      pairs.push({ key, value: value.map(scalar).join(", ") });
    }
    return;
  }

  pairs.push({ key, value: scalar(value) });
}

/**
 * Every kind's `detail` read the same way: dotted keys, strings unquoted,
 * arrays joined, nested objects flattened.
 *
 * A key with nothing under it — an empty object or an empty array — yields no
 * pair, so every pair drawn has a value.
 */
export function flattened(detail: Record<string, unknown>): readonly Pair[] {
  const pairs: Pair[] = [];
  into(pairs, "", detail);
  return pairs;
}

const HEAD = 8;
const TAIL = 4;

/** Enough of an id to recognise and to tell two apart, and no more. */
export function shortened(id: string): string {
  return id.length <= HEAD + TAIL + 1
    ? id
    : `${id.slice(0, HEAD)}…${id.slice(-TAIL)}`;
}

/** Who did it. A person reading their own log is the one agent worth a pronoun. */
export function agentOf(by: Agent): string {
  switch (by.kind) {
    case "person":
      return "you";
    case "provider":
      return `provider ${by.provider}`;
    case "source":
      return `source ${by.source}`;
    default:
      return "notemap";
  }
}
