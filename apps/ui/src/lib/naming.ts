import type { Capability } from "@notemap/client";

import { client } from "./client";
import { learn, nameFor, type Named } from "./names.svelte";
import { fieldsOf } from "./schema-form";

/**
 * Filling in what nothing has learned yet. Apart from the cache it writes into
 * because this is the half that reaches the outside world: what remembers a
 * name is state a test resets between cases, and what goes and asks for one is
 * a client nothing may build by accident.
 */

/**
 * The fields of one capability whose values are handles rather than names: the
 * destination can be asked about them, and they hold only what it already has.
 * Those two together are what makes a value something nobody wrote and nobody
 * can read.
 */
function nameable(capability: Capability): readonly string[] {
  return fieldsOf(capability.argumentsSchema)
    .filter((field) => field.askable && field.offeredOnly)
    .map((field) => field.name);
}

/**
 * Fill in what is not remembered for one destination's saved arguments. The
 * browse goes first and answers most of it in one request — a page is a hundred
 * channels — and only what is left over is asked for one at a time.
 *
 * Best effort throughout: a destination that is asleep leaves its values
 * reading as they stand, which is what they did before this existed.
 */
export async function resolve(
  destination: string,
  wanted: readonly Omit<Named, "destination">[],
): Promise<void> {
  const missing = wanted.filter(
    (each) => nameFor({ ...each, destination }) === undefined,
  );
  if (missing.length === 0) return;

  const described = await client.destinations
    .describe(destination)
    .catch(() => undefined);
  if (described?.kind !== "described") return;

  const asking = missing.filter((each) => {
    const capability = described.capabilities.find(
      (one) => one.name === each.capability,
    );
    return (
      capability !== undefined && nameable(capability).includes(each.field)
    );
  });

  for (const [where, group] of grouped(asking)) {
    const [capability = "", field = ""] = where.split(" ");
    const answered = await client.destinations
      .candidates(destination, { capability, field })
      .catch(() => undefined);

    const entries = answered?.kind === "answered" ? answered.entries : [];

    for (const each of group) {
      const found = entries.find(
        (entry) =>
          String(entry.value ?? "") === each.value ||
          String(entry.durable ?? "") === each.value,
      );
      if (found !== undefined) {
        learn({ ...each, destination }, found.label);
        continue;
      }

      // Past the end of the page, which for an account of any size is where
      // most of them are. One ask each, and only for these.
      const named = await client.destinations
        .named(destination, { capability, field, value: each.value })
        .catch(() => undefined);
      if (named?.kind === "answered" && named.entry !== undefined) {
        learn({ ...each, destination }, named.entry.label);
      }
    }
  }
}

/** By capability and field, since one browse answers a whole group of them. */
function grouped(
  wanted: readonly Omit<Named, "destination">[],
): Map<string, readonly Omit<Named, "destination">[]> {
  const by = new Map<string, Omit<Named, "destination">[]>();
  for (const each of wanted) {
    const key = [each.capability, each.field].join(" ");
    by.set(key, [...(by.get(key) ?? []), each]);
  }
  return by;
}
