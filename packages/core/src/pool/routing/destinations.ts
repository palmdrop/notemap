import type { DestinationAdapter } from "../../types/api/ports";
import type { DestinationId } from "../../types/domain/ids";
import type { DestinationReport } from "../../types/domain/routing";

export type DestinationIndex = ReadonlyMap<DestinationId, DestinationAdapter>;

/** Built once, with the pool, so a duplicate name is refused where it can still be corrected. */
export function indexDestinations(
  adapters: readonly DestinationAdapter[],
): DestinationIndex {
  const index = new Map<DestinationId, DestinationAdapter>();

  for (const adapter of adapters) {
    if (index.has(adapter.id)) {
      throw new Error(`two destinations are wired as ${adapter.id}`);
    }
    index.set(adapter.id, adapter);
  }

  return index;
}

export function destinations(
  index: DestinationIndex,
  signal?: AbortSignal,
): Promise<readonly DestinationReport[]> {
  return Promise.all([...index.values()].map((each) => report(each, signal)));
}

async function report(
  adapter: DestinationAdapter,
  signal?: AbortSignal,
): Promise<DestinationReport> {
  try {
    return { kind: "described", ...(await adapter.describe(signal)) };
  } catch (cause) {
    return {
      kind: "undescribable",
      id: adapter.id,
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
