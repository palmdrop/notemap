import type { PoolPorts } from "#types/api/ports";
import type { DestinationProbe } from "#types/domain/destination";
import type { DestinationId } from "#types/domain/ids";
import { NotOffered } from "./candidates";
import { Unusable, usability } from "./usability";

/**
 * What an adapter throws where it was reached and answered no — a credential
 * refused, a root that is not there, an account nobody declared. Everything
 * else it throws is read as unreachable, which is the half a delivery would
 * retry past; this is the half a person has to go and fix. Named for the
 * answer it produces rather than for `Refused`, which both adapters already
 * use for a delivery that will not be attempted again.
 */
export class Rejected extends Error {
  constructor(detail: string, options?: { cause?: unknown }) {
    super(detail, options);
    this.name = "Rejected";
  }
}

/**
 * Whether a destination is really there. Mirrors `candidates()`: usability is
 * settled before the adapter is asked anything, and a throw from asking is
 * sorted into which failure it was.
 */
export async function probe(
  ports: PoolPorts,
  id: DestinationId,
  signal?: AbortSignal,
): Promise<DestinationProbe | undefined> {
  const destination = await ports.store.destination(id);
  if (destination === undefined) return undefined;

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "unusable", detail: usable.detail };
  }

  try {
    await ports.destinations.probe(destination, signal);
    return { kind: "ready" };
  } catch (cause) {
    if (cause instanceof NotOffered) return { kind: "not-offered" };
    if (cause instanceof Unusable) {
      return { kind: "unusable", detail: cause.message };
    }
    if (cause instanceof Rejected) {
      return { kind: "rejected", detail: cause.message };
    }
    return {
      kind: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
