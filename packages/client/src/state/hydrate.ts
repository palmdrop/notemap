import type {
  AssetId,
  Destination,
  RoutingTemplate,
  Item,
  ItemId,
  PoolIdentity,
  TagUse,
} from "#api/types";
import { Unreadable } from "../errors";
import type { Writable } from "../observable/observable";
import type { PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { namedBy } from "#assets/assets";
import { emptyState, type ClientState } from "./state";

/**
 * The store read back into the cache it follows, and what it read.
 *
 * Pending operations are not re-applied: the cache was persisted with their
 * effects already in it. A crash between the two writes therefore leaves one
 * effect missing until that operation drains.
 *
 * The surfaces stay empty. A page is a position the pool handed back, and the
 * store holds no position — drawing one from the cache is later work.
 */
export async function hydrate(
  state: Writable<ClientState>,
  store: ClientStore,
  report: (error: unknown) => void,
): Promise<ClientState> {
  // Each collection is read on its own terms, so a cache that cannot be read
  // does not also cost the outbox — the only one whose loss costs a person work.
  async function read<T>(
    collection: string,
    fallback: T,
    from: () => Promise<T>,
  ): Promise<T> {
    try {
      return await from();
    } catch (error) {
      report(new Unreadable(collection, error));
      return fallback;
    }
  }

  const [outbox, items, tags, destinations, templates, pool] =
    await Promise.all([
      read<readonly PendingOperation[]>("outbox", [], () => store.readOutbox()),
      read<readonly Item[]>("items", [], () => store.readItems()),
      read<readonly TagUse[]>("tags", [], () => store.readTags()),
      read<readonly Destination[]>("destinations", [], () =>
        store.readDestinations(),
      ),
      read<readonly RoutingTemplate[]>("templates", [], () =>
        store.readTemplates(),
      ),
      read<PoolIdentity | undefined>("pool identity", undefined, () =>
        store.readPoolIdentity(),
      ),
    ]);

  const hydrated: ClientState = {
    ...emptyState(),
    blobUrls: await read("blobs", new Map<AssetId, string>(), () =>
      urlsFor(store, outbox),
    ),
    items: new Map<ItemId, Item>(items.map((item) => [item.id, item])),
    outbox: outbox.map(attemptable),
    tags,
    destinations,
    templates,
    ...(pool === undefined ? {} : { pool }),
  };

  state.set(hydrated);
  return hydrated;
}

/** The URL an adapter hands out belongs to the session that asked for it. */
async function urlsFor(
  store: ClientStore,
  outbox: readonly PendingOperation[],
): Promise<Map<AssetId, string>> {
  const urls = new Map<AssetId, string>();

  for (const held of outbox) {
    for (const asset of namedBy(held.operation)) {
      const url = await store.blobUrl(asset);
      if (url !== undefined) urls.set(asset, url);
    }
  }

  return urls;
}

/**
 * `sending` is a claim about a process that no longer exists, and a drain only
 * picks up what is pending or unreachable — so an operation the tab was closed
 * on top of would sit there forever. Every operation is idempotent under an id
 * minted before it was first sent, which is what makes attempting it again safe.
 */
function attemptable(operation: PendingOperation): PendingOperation {
  return operation.state === "sending"
    ? { ...operation, state: "pending" }
    : operation;
}
