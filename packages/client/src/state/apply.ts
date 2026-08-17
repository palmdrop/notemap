import type { Item, ItemId } from "../api/types";
import { optimisticItem } from "../capture/envelope";
import { Unencodable } from "../errors";
import type { Operation } from "../outbox/operations";
import {
  cached,
  forget,
  insertOldestFirst,
  withIds,
  without,
  type ClientState,
} from "./state";

export type Undo = (state: ClientState) => ClientState;

export type Applied = {
  readonly state: ClientState;
  readonly undo: Undo;
};

/**
 * Applies an operation to the cache at once, and hands back the reversal for a
 * refusal to run. The reversal takes the state as it is by then, not as it was,
 * because other operations may have settled in between.
 */
export function applyOperation(
  state: ClientState,
  operation: Operation,
  at: string,
): Applied {
  switch (operation.kind) {
    case "capture":
      return applyCapture(state, optimisticItem(operation.envelope));

    case "archive":
      return applyArchive(state, operation.item, at, operation.reason);

    case "unarchive":
      return applyUnarchive(state, operation.item);

    default:
      throw new Unencodable(operation.kind);
  }
}

function applyCapture(state: ClientState, item: Item): Applied {
  const items = cached(state, [item]);

  return {
    state: {
      ...state,
      items,
      feed: withIds(state.feed, [item.id, ...state.feed.ids]),
      queue: withIds(
        state.queue,
        insertOldestFirst(state.queue.ids, item.id, items),
      ),
    },
    undo: (current) => forget(current, item.id),
  };
}

function applyArchive(
  state: ClientState,
  id: ItemId,
  at: string,
  reason?: string,
): Applied {
  const previous = state.items.get(id);
  if (previous === undefined) return unchanged(state);

  const archived: Item = {
    ...previous,
    archived: { archivedAt: at, ...(reason === undefined ? {} : { reason }) },
  };

  // The index, not the rank: the pool breaks ties on a key of its own, so
  // re-ranking a rolled-back item would shuffle it past its neighbours.
  const was = state.queue.ids.indexOf(id);

  return {
    state: {
      ...state,
      items: cached(state, [archived]),
      queue: withIds(state.queue, without(state.queue.ids, id)),
    },
    undo: (current) => ({
      ...current,
      items: cached(current, [previous]),
      queue: withIds(current.queue, replaced(current.queue.ids, id, was)),
    }),
  };
}

function replaced(
  ids: readonly ItemId[],
  id: ItemId,
  at: number,
): readonly ItemId[] {
  if (at < 0 || ids.includes(id)) return ids;

  const where = Math.min(at, ids.length);
  return [...ids.slice(0, where), id, ...ids.slice(where)];
}

function applyUnarchive(state: ClientState, id: ItemId): Applied {
  const previous = state.items.get(id);
  if (previous === undefined) return unchanged(state);

  const { archived: _archived, ...alive } = previous;
  const items = cached(state, [alive]);

  return {
    state: {
      ...state,
      items,
      queue: withIds(
        state.queue,
        insertOldestFirst(state.queue.ids, id, items),
      ),
    },
    undo: (current) => ({
      ...current,
      items: cached(current, [previous]),
      queue: withIds(current.queue, without(current.queue.ids, id)),
    }),
  };
}

function unchanged(state: ClientState): Applied {
  return { state, undo: (current) => current };
}
