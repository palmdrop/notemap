import type { DestinationKindAdapter, Destinations } from "#types/api/ports";
import type { Destination } from "#types/domain/destination";

import { NotOffered } from "./candidates";

/** The port, over one adapter per kind. */
export function destinationRegistry(
  adapters: readonly DestinationKindAdapter[],
): Destinations {
  const byKind = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  if (byKind.size !== adapters.length) {
    throw new Error("two adapters are registered for one destination kind");
  }

  const reach = (destination: Destination): DestinationKindAdapter => {
    const adapter = byKind.get(destination.kind);
    // Unreachable unless the registry disagrees with the kinds it published:
    // a kind nothing speaks is reported as unusable rather than asked.
    if (adapter === undefined) {
      throw new Error(`no adapter is registered for ${destination.kind}`);
    }
    return adapter;
  };

  return {
    kinds: () =>
      adapters.map(({ name, settingsSchema }) => ({ name, settingsSchema })),
    describe: (destination, signal) =>
      reach(destination).describe(destination, signal),
    deliver: (destination, delivery, signal) =>
      reach(destination).deliver(destination, delivery, signal),
    candidates: (destination, request, signal) => {
      const adapter = reach(destination);
      if (adapter.candidates === undefined) {
        return Promise.reject(
          new NotOffered(`the ${adapter.name} kind does not offer candidates`),
        );
      }
      return adapter.candidates(destination, request, signal);
    },
    preview: (destination, delivery, signal) => {
      const adapter = reach(destination);
      if (adapter.preview === undefined) {
        return Promise.reject(
          new NotOffered(`the ${adapter.name} kind cannot be previewed`),
        );
      }
      return adapter.preview(destination, delivery, signal);
    },
    probe: (destination, signal) => {
      const adapter = reach(destination);
      if (adapter.probe === undefined) {
        return Promise.reject(
          new NotOffered(`the ${adapter.name} kind cannot be probed`),
        );
      }
      return adapter.probe(destination, signal);
    },
  };
}
