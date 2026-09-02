import type { PoolPorts } from "#types/api/ports";
import type { DestinationId } from "#types/domain/ids";
import type {
  RememberedAnswer,
  RememberedRequest,
} from "#types/domain/routing";

/**
 * The other half of `candidates`: the same question — destination, capability,
 * field — answered from what the pool's own routing records hold rather than
 * from what the destination offers. One is the vault's answer and one is the
 * pool's, and whatever draws them merges the two.
 *
 * Absent means no destination has that id, exactly as `candidates` says it.
 * Nothing else here can fail: this reads the pool, and the pool is the thing
 * doing the reading — an unreachable destination has no bearing on it, which is
 * what makes remembered places usable when candidates has nothing to say.
 */
export async function remembered(
  ports: PoolPorts,
  id: DestinationId,
  request: Omit<RememberedRequest, "destination">,
): Promise<RememberedAnswer | undefined> {
  const destination = await ports.store.destination(id);
  if (destination === undefined) return undefined;

  return ports.store.remembered({ ...request, destination: id });
}
