import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { Capability } from "@notemap/client";

import { client } from "./client";
import { readingOf, type Reading } from "./routing";

/**
 * What each destination's capabilities are, asked once a session. Describing
 * reaches nothing past the daemon, and the surfaces that read a saved argument
 * set — a routing line, a template, a record — need the schema only to know
 * which of its fields say where and which say how. Only an answer is kept: a
 * refusal is asked again by whoever wants it next.
 */
const held = new SvelteMap<string, readonly Capability[]>();
const refused = new SvelteSet<string>();
const asking = new SvelteMap<
  string,
  Promise<readonly Capability[] | undefined>
>();

/**
 * Untracked, since the effects that ask are the ones drawing what comes back:
 * one depending on what is being asked would ask again whenever it changed.
 */
export function described(
  destination: string,
): Promise<readonly Capability[] | undefined> {
  return untrack(() => ask(destination));
}

function ask(destination: string): Promise<readonly Capability[] | undefined> {
  const already = asking.get(destination);
  if (already !== undefined) return already;

  const failed = () => {
    asking.delete(destination);
    refused.add(destination);
    return undefined;
  };

  const asked = client.destinations.describe(destination).then((answer) => {
    if (answer.kind !== "described") return failed();
    held.set(destination, answer.capabilities);
    refused.delete(destination);
    return answer.capabilities;
  }, failed);
  asking.set(destination, asked);
  return asked;
}

/** One capability as described, where this session has heard. Reactive. */
export function capabilityHeld(
  destination: string,
  capability: string,
): Capability | undefined {
  return held.get(destination)?.find((one) => one.name === capability);
}

/**
 * How a capability's arguments read, `asking` until its destination has
 * answered once. A refusal reads as nothing known rather than holding forever:
 * a deleted destination is never described.
 */
export function readingHeld(
  destination: string,
  capability: string,
): Reading | "asking" | undefined {
  if (held.has(destination)) {
    return readingOf(capabilityHeld(destination, capability));
  }
  return refused.has(destination) ? undefined : "asking";
}

/** For tests, which would otherwise carry one case's descriptions into the next. */
export function forgetDescriptions(): void {
  held.clear();
  refused.clear();
  asking.clear();
}
