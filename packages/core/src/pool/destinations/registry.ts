import type {
  DestinationKindAdapter,
  Destinations,
} from "../../types/api/ports";
import type { Destination } from "../../types/domain/destination";

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
  };
}
