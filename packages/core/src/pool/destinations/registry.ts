import type {
  DestinationKindAdapter,
  Destinations,
} from "../../types/api/ports";
import type { Destination } from "../../types/domain/destination";

/**
 * The port, over one adapter per kind. Which adapters a pool gets is the host's;
 * dispatching to the one that speaks a row's kind is the same in every host, so
 * it is not.
 */
export function destinationRegistry(
  adapters: readonly DestinationKindAdapter[],
): Destinations {
  const byKind = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  if (byKind.size !== adapters.length) {
    throw new Error("two adapters are registered for one destination kind");
  }

  const reach = (destination: Destination): DestinationKindAdapter => {
    const adapter = byKind.get(destination.kind);
    // A kind nothing speaks is reported as unusable and never asked, so this is
    // a registry that disagrees with the list it published.
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
