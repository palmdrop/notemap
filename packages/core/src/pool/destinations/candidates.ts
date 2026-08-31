import type { PoolPorts } from "#types/api/ports";
import type {
  CandidatesReport,
  CandidatesRequest,
} from "#types/domain/destination";
import type { DestinationId } from "#types/domain/ids";
import { Unusable, usability } from "./usability";

/**
 * Nothing here can be browsed, and that is a fact about the kind rather than
 * a failure: the registry throws it for an adapter with no `candidates` at
 * all, and an adapter throws it for a field it does not answer for. Distinct
 * from every other throw, which `candidates()` below sorts into
 * `unreachable`.
 */
export class NotOffered extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NotOffered";
  }
}

/**
 * What a destination answers when asked what one field of one capability's
 * arguments could hold. Mirrors `report()`: usability is settled before the
 * adapter is asked anything, and a throw from asking is sorted into which of
 * the three failures it was.
 */
export async function candidates(
  ports: PoolPorts,
  id: DestinationId,
  request: CandidatesRequest,
  signal?: AbortSignal,
): Promise<CandidatesReport | undefined> {
  const destination = await ports.store.destination(id);
  if (destination === undefined) return undefined;

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "unusable", detail: usable.detail };
  }

  try {
    const answer = await ports.destinations.candidates(
      destination,
      request,
      signal,
    );
    return { kind: "answered", ...answer };
  } catch (cause) {
    if (cause instanceof NotOffered) return { kind: "not-offered" };
    if (cause instanceof Unusable) {
      return { kind: "unusable", detail: cause.message };
    }
    return {
      kind: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
