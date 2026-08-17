import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  from,
  map,
  pairwise,
} from "rxjs";

import type { Item, ItemId } from "../api/types";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import type { ClientState } from "./state";

/**
 * Mirrors the cache into the store as it changes, rather than making every path
 * that touches an item remember to write it. `concatMap` is what keeps a
 * durable adapter seeing the writes in the order they happened.
 */
export function persistItems(
  state: Writable<ClientState>,
  store: ClientStore,
): void {
  state.changes
    .pipe(
      map((current) => current.items),
      distinctUntilChanged(),
      pairwise(),
      // The store is a mirror of the cache, so a write that fails must not stop
      // the ones after it. Reporting one is the durable adapter's to answer.
      concatMap(([before, after]) =>
        from(write(store, before, after)).pipe(catchError(() => EMPTY)),
      ),
    )
    .subscribe();
}

async function write(
  store: ClientStore,
  before: ReadonlyMap<ItemId, Item>,
  after: ReadonlyMap<ItemId, Item>,
): Promise<void> {
  const changed = [...after.values()].filter(
    (item) => before.get(item.id) !== item,
  );
  const gone = [...before.keys()].filter((id) => !after.has(id));

  if (changed.length > 0) await store.writeItems(changed);
  if (gone.length > 0) await store.removeItems(gone);
}
