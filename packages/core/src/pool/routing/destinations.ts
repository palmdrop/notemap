import type { DestinationAdapter } from "../../types/api/ports";
import type { DestinationId } from "../../types/domain/ids";
import type { DestinationDescriptor } from "../../types/domain/routing";

export type WiredDestination = {
  readonly adapter: DestinationAdapter;
  readonly descriptor: DestinationDescriptor;
};

export type DestinationIndex = ReadonlyMap<DestinationId, WiredDestination>;

/** Built once, with the pool, so a duplicate name is refused where it can still be corrected. */
export function indexDestinations(
  adapters: readonly DestinationAdapter[],
): DestinationIndex {
  const index = new Map<DestinationId, WiredDestination>();

  for (const adapter of adapters) {
    const descriptor = adapter.describe();
    if (index.has(descriptor.id)) {
      throw new Error(`two destinations are wired as ${descriptor.id}`);
    }
    index.set(descriptor.id, { adapter, descriptor });
  }

  return index;
}

export async function destinations(
  index: DestinationIndex,
): Promise<readonly DestinationDescriptor[]> {
  return [...index.values()].map((wired) => wired.descriptor);
}
