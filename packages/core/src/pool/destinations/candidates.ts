import type { PoolPorts } from "#types/api/ports";
import type {
  CandidatesReport,
  CandidatesRequest,
} from "#types/domain/destination";
import type { DestinationId } from "#types/domain/ids";
import { Unusable, usability } from "./usability";

/**
 * Thrown by the registry itself, never by an adapter: the kind is usable and
 * the adapter registered for it simply has no `candidates`. Distinct from
 * every other throw, which `candidates()` below sorts into `unreachable`.
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
