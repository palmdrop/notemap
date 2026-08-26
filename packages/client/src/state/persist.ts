import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  pairwise,
  startWith,
} from "rxjs";

import type { Item, ItemId } from "../api/types";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import type { ClientState } from "./state";

/**
 * Follows the cache into the store as it changes, rather than making every path
 * that touches an item remember to write it. `hydrated` is what came out of the
 * store, which is the one thing that must not be written back into it.
 */
export function persist(
  state: Writable<ClientState>,
  store: ClientStore,
  hydrated: ClientState,
  report: (error: unknown) => void,
): void {
  persistItems(state, store, hydrated, report);
  whole(
    state,
    (current) => current.tags,
    (tags) => store.writeTags(tags),
    hydrated,
    report,
  );
  whole(
    state,
    (current) => current.destinations,
    (destinations) => store.writeDestinations(destinations),
    hydrated,
    report,
  );
  whole(
    state,
    (current) => current.pool,
    async (pool) => {
      if (pool !== undefined) await store.writePoolIdentity(pool);
    },
    hydrated,
    report,
  );
}

/** A read cache is replaced whole, so there is nothing to diff. */
function whole<T>(
  state: Writable<ClientState>,
  read: (current: ClientState) => T,
  write: (value: T) => Promise<void>,
  hydrated: ClientState,
  report: (error: unknown) => void,
): void {
  const held = read(hydrated);

  state.changes
    .pipe(
      map(read),
      distinctUntilChanged(),
      // Held by value rather than by counting emissions: a subscription that
      // arrived a tick late would otherwise drop the first real write instead.
      filter((value) => value !== held),
      concatMap((value) => followed(write(value), report)),
    )
    .subscribe();
}

function persistItems(
  state: Writable<ClientState>,
  store: ClientStore,
  hydrated: ClientState,
  report: (error: unknown) => void,
): void {
  state.changes
    .pipe(
      map((current) => current.items),
      distinctUntilChanged(),
      // Seeded with what the store answered, so an eviction made during
      // hydration reaches it.
      startWith(hydrated.items),
      pairwise(),
      concatMap(([before, after]) =>
        followed(write(store, before, after), report),
      ),
    )
    .subscribe();
}

/**
 * `concatMap` is what keeps a durable adapter seeing the writes in the order
 * they happened. The store follows the cache, so a write that fails is
 * reported and dropped rather than stopping the ones after it.
 */
function followed(written: Promise<void>, report: (error: unknown) => void) {
  return from(written).pipe(
    catchError((error: unknown) => {
      report(error);
      return EMPTY;
    }),
  );
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
