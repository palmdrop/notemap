import type {
  AssetId,
  Destination,
  RoutingTemplate,
  Item,
  ItemId,
  PoolIdentity,
  PoolSetting,
  TagUse,
} from "#api/types";
import { Unreadable } from "../errors";
import type { Writable } from "../observable/observable";
import type { PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { namedBy } from "#assets/assets";
import { emptyState, type ClientState, type HeldBlob } from "./state";

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

  const [outbox, items, tags, destinations, templates, poolSettings, pool] =
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
      // Absent is "not yet read"; the fallback on a store that cannot be read
      // is the same fact a cold client answers, not a guessed default.
      read<readonly PoolSetting[] | undefined>("pool settings", undefined, () =>
        store.readPoolSettings(),
      ),
      read<PoolIdentity | undefined>("pool identity", undefined, () =>
        store.readPoolIdentity(),
      ),
    ]);

  const hydrated: ClientState = {
    ...emptyState(),
    held: await read("blobs", new Map<AssetId, HeldBlob>(), () =>
      heldBy(store, outbox),
    ),
    items: new Map<ItemId, Item>(items.map((item) => [item.id, item])),
    outbox,
    tags,
    destinations,
    templates,
    ...(poolSettings === undefined ? {} : { poolSettings }),
    ...(pool === undefined ? {} : { pool }),
  };

  state.set(hydrated);
  return hydrated;
}

/** The URL an adapter hands out belongs to the session that asked for it. */
async function heldBy(
  store: ClientStore,
  outbox: readonly PendingOperation[],
): Promise<Map<AssetId, HeldBlob>> {
  const blobs = new Map<AssetId, HeldBlob>();

  for (const pending of outbox) {
    for (const asset of namedBy(pending.operation)) {
      const file = await store.readBlob(asset);
      if (file === undefined) continue;

      const url = await store.blobUrl(asset);
      blobs.set(asset, {
        mime: file.type,
        ...(url === undefined ? {} : { url }),
      });
    }
  }

  return blobs;
}
