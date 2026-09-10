import type { PoolPorts } from "#types/api/ports";
import type { NamingReport, NamingRequest } from "#types/domain/destination";
import type { DestinationId } from "#types/domain/ids";

import { NotOffered } from "./candidates";
import { Unusable, usability } from "./usability";

/**
 * What a destination calls the one thing a field already holds. Asked and
 * sorted exactly as `candidates` is; separate from it because a browse is a
 * capped sample and this is not, so the value a surface holds is precisely the
 * one a truncated answer may never mention.
 *
 * An entry the destination has nothing to say about comes back answered and
 * empty. That is the truth: a place typed by hand is not one it offered, and
 * refusing would make a value it delivers to perfectly well look broken.
 */
export async function naming(
  ports: PoolPorts,
  id: DestinationId,
  request: NamingRequest,
  signal?: AbortSignal,
): Promise<NamingReport | undefined> {
  const destination = await ports.store.destination(id);
  if (destination === undefined) return undefined;

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "unusable", detail: usable.detail };
  }

  try {
    const answer = await ports.destinations.naming(
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
