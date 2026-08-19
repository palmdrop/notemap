import type { PoolPorts } from "../../types/api/ports";
import type {
  Destination,
  DestinationReport,
} from "../../types/domain/destination";
import type { DestinationId } from "../../types/domain/ids";
import { usability } from "./usability";

/** A read of the pool: instant, unpaginated, and it probes nothing. */
export function list(ports: PoolPorts): Promise<readonly Destination[]> {
  return ports.store.destinations();
}

export async function describe(
  ports: PoolPorts,
  id: DestinationId,
  signal?: AbortSignal,
): Promise<DestinationReport | undefined> {
  const destination = await ports.store.destination(id);
  return destination === undefined
    ? undefined
    : report(ports, destination, signal);
}

/** The one call that reaches the outside world, and so the one that can hang. */
export async function report(
  ports: PoolPorts,
  destination: Destination,
  signal?: AbortSignal,
): Promise<DestinationReport> {
  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "unusable", detail: usable.detail };
  }

  try {
    return {
      kind: "described",
      ...(await ports.destinations.describe(destination, signal)),
    };
  } catch (cause) {
    return {
      kind: "undescribable",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
