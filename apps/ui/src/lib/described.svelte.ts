import { SvelteMap } from "svelte/reactivity";

import type { Capability } from "@notemap/client";

import { client } from "./client";

/**
 * What each destination's capabilities are, asked once a session. Describing
 * reaches nothing past the daemon, and the surfaces that read a saved argument
 * set — a routing line, a template, a record — need the schema only to know
 * which of its fields say where and which say how. Only an answer is kept: a
 * refusal is asked again by whoever wants it next.
 */
const held = new SvelteMap<string, readonly Capability[]>();
const asking = new SvelteMap<
  string,
  Promise<readonly Capability[] | undefined>
>();

export function described(
  destination: string,
): Promise<readonly Capability[] | undefined> {
  const already = asking.get(destination);
  if (already !== undefined) return already;

  const asked = client.destinations.describe(destination).then(
    (answer) => {
      if (answer.kind !== "described") {
        asking.delete(destination);
        return undefined;
      }
      held.set(destination, answer.capabilities);
      return answer.capabilities;
    },
    () => {
      asking.delete(destination);
      return undefined;
    },
  );
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

/** For tests, which would otherwise carry one case's descriptions into the next. */
export function forgetDescriptions(): void {
  held.clear();
  asking.clear();
}
