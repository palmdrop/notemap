import type { Item, ItemId } from "../api/types";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import { emptyState, type ClientState } from "./state";

/**
 * The store read back into the cache it was mirrored from.
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
): Promise<void> {
  const [outbox, items, tags, destinations] = await Promise.all([
    store.readOutbox(),
    store.readItems(),
    store.readTags(),
    store.readDestinations(),
  ]);

  state.set({
    ...emptyState(),
    items: new Map<ItemId, Item>(items.map((item) => [item.id, item])),
    outbox: [...outbox],
    tags,
    destinations,
  });
}
