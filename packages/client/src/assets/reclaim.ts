import type { AssetId } from "#api/types";
import type { PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { namedBy } from "./assets";

/**
 * How long a blob nothing names is left alone. The bytes are written before the
 * operation that names them, so to a walk running at the wrong instant named
 * and about-to-be-named look alike — and two shells can share one store, so
 * that instant is reachable without a crash.
 */
export const HELD_GRACE_MS = 10 * 60 * 1000;

/**
 * Lets go of every blob the store holds that no operation in the outbox names
 * and that was written longer ago than the grace window. Answers what it took.
 *
 * A client holds bytes for exactly as long as an operation names them, so
 * anything else in there is what a bug or a crash left, and nothing else will
 * ever claim it.
 */
export async function reclaim(
  store: ClientStore,
  outbox: readonly PendingOperation[],
  now: number,
): Promise<readonly AssetId[]> {
  const named = new Set<AssetId>(
    outbox.flatMap((held) => namedBy(held.operation)),
  );

  const taken: AssetId[] = [];
  for (const held of await store.blobs()) {
    if (named.has(held.asset)) continue;
    if (now - Date.parse(held.at) < HELD_GRACE_MS) continue;

    await store.removeBlob(held.asset);
    taken.push(held.asset);
  }

  return taken;
}
