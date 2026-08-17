import type { Item, ItemId } from "../api/types";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import type { ClientState } from "./state";

/**
 * Mirrors the cache into the store as it changes, rather than making every path
 * that touches an item remember to write it. Writes are chained so a durable
 * adapter sees them in the order they happened.
 */
export function persistItems(
  state: Writable<ClientState>,
  store: ClientStore,
): void {
  let known = state.get().items;
  let writing: Promise<unknown> = Promise.resolve();

  state.subscribe((current) => {
    if (current.items === known) return;

    const changed: Item[] = [];
    for (const item of current.items.values()) {
      if (known.get(item.id) !== item) changed.push(item);
    }

    const gone: ItemId[] = [];
    for (const id of known.keys()) {
      if (!current.items.has(id)) gone.push(id);
    }

    known = current.items;
    writing = writing.then(async () => {
      if (changed.length > 0) await store.writeItems(changed);
      if (gone.length > 0) await store.removeItems(gone);
    });
  });
}
