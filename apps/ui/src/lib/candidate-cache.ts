import type { DestinationCandidates } from "@notemap/client";

/** Only an answer is kept: a refusal is not something to draw again later. */
type Answered = Extract<DestinationCandidates, { kind: "answered" }>;

/**
 * The last answer a destination gave for one field, kept for the life of the
 * page so that opening the composer a second time draws what it drew the first
 * time **while** it asks again. Asking is a round trip to somebody else's
 * server — an are.na account's channels, a vault over WebDAV — and staring at
 * the asking mark for an answer that has not changed since a minute ago is the
 * whole of what this avoids.
 *
 * Never a substitute for asking: what is held is drawn *and* the ask goes out,
 * so a stale list is only ever stale for as long as the round trip takes. That
 * is what makes it safe to keep with no expiry and no invalidation — nothing
 * reads it as the truth, only as something better than nothing.
 */
const held = new Map<string, Answered>();

export type Asked = {
  readonly destination: string;
  readonly capability: string;
  readonly field: string;
  readonly scope?: string | undefined;
};

/** `\0` between the parts: none of them may contain it, so no two asks collide. */
function keyOf(asked: Asked): string {
  return [
    asked.destination,
    asked.capability,
    asked.field,
    asked.scope ?? "",
  ].join("\u0000");
}

export function recall(asked: Asked): Answered | undefined {
  return held.get(keyOf(asked));
}

export function remember(asked: Asked, answer: Answered): void {
  held.set(keyOf(asked), answer);
}

/** For tests, which would otherwise leak one case's answers into the next. */
export function forgetEverything(): void {
  held.clear();
}
