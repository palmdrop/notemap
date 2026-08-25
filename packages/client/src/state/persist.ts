import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  from,
  map,
  pairwise,
  skip,
} from "rxjs";

import type { Item, ItemId } from "../api/types";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import type { ClientState } from "./state";

/**
 * Mirrors the cache into the store as it changes, rather than making every path
 * that touches an item remember to write it. Subscribed after hydration, so the
 * state read back out of the store is not written straight into it again.
 */
export function persist(
  state: Writable<ClientState>,
  store: ClientStore,
): void {
  persistItems(state, store);
  whole(
    state,
    (current) => current.tags,
    (tags) => store.writeTags(tags),
  );
  whole(
    state,
    (current) => current.destinations,
    (destinations) => store.writeDestinations(destinations),
  );
}

/** A read cache is replaced whole, so there is nothing to diff. */
function whole<T>(
  state: Writable<ClientState>,
  read: (current: ClientState) => T,
  write: (value: T) => Promise<void>,
): void {
  state.changes
    .pipe(
      map(read),
      distinctUntilChanged(),
      // The first emission is what hydration left, which came from the store.
      skip(1),
      concatMap((value) => mirrored(write(value))),
    )
    .subscribe();
}

function persistItems(state: Writable<ClientState>, store: ClientStore): void {
  state.changes
    .pipe(
      map((current) => current.items),
      distinctUntilChanged(),
      pairwise(),
      concatMap(([before, after]) => mirrored(write(store, before, after))),
    )
    .subscribe();
}

/**
 * `concatMap` is what keeps a durable adapter seeing the writes in the order
 * they happened. The store is a mirror of the cache, so a write that fails must
 * not stop the ones after it; reporting one is the durable adapter's to answer.
 */
function mirrored(written: Promise<void>) {
  return from(written).pipe(catchError(() => EMPTY));
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
