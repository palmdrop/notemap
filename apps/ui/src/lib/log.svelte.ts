import {
  Unreachable,
  saidBy,
  type Action,
  type ActionPosition,
  type ItemId,
  type Order,
} from "@notemap/client";

import { client } from "./client";

/**
 * The log's walked page. The client keeps no page for it and writes none of it
 * to the store, so the shell holds what has been read — at module level rather
 * than per component, which is what lets the chrome say how much is shown.
 */
let order = $state<Order>("newest-first");
let item = $state<ItemId | undefined>(undefined);
let rows = $state<readonly Action[]>([]);
let after = $state<ActionPosition | undefined>(undefined);
let more = $state(false);
let loading = $state(false);
let answered = $state(false);
let refused = $state<string | undefined>(undefined);

/**
 * Which walk is the current one. A read that lands after the log has been
 * turned around is answering for a page that no longer exists.
 */
let walking = 0;
let started = false;

/**
 * A duplicate id is a keyed block crashing the whole surface, which is the
 * worst thing a log can do to somebody trying to work out what went wrong.
 */
function joined(
  held: readonly Action[],
  arriving: readonly Action[],
): readonly Action[] {
  const seen = new Set(held.map((action) => action.id));
  return [...held, ...arriving.filter((action) => !seen.has(action.id))];
}

async function walk(from: ActionPosition | undefined): Promise<void> {
  const mine = walking;
  loading = true;
  refused = undefined;

  try {
    const page = await client.actions.read({
      order,
      ...(item === undefined ? {} : { item }),
      ...(from === undefined ? {} : { after: from }),
    });
    if (mine !== walking) return;

    rows = from === undefined ? page.values : joined(rows, page.values);
    after = page.after;
    more = page.after !== undefined;
    answered = true;
  } catch (error) {
    // A pool that never answered is not a refusal, and the chrome says
    // "offline" for the whole shell rather than every surface saying it again.
    if (mine === walking && !(error instanceof Unreachable)) {
      refused = saidBy(error);
    }
  } finally {
    if (mine === walking) loading = false;
  }
}

export const log = {
  get order() {
    return order;
  },
  get item() {
    return item;
  },
  get rows() {
    return rows;
  },
  get more() {
    return more;
  },
  get loading() {
    return loading;
  },
  get refused() {
    return refused;
  },
  /** Nothing has happened, as against nothing has been read. */
  get quiet() {
    return answered && rows.length === 0;
  },
  get shown() {
    return rows.length;
  },

  /**
   * Reads the log as the URL now names it. A position belongs to the order and
   * the filter that produced it, so changing either walks again from the start
   * rather than stitching two of them together.
   */
  reading(wanted: Order, subject: ItemId | undefined): void {
    if (started && wanted === order && subject === item) return;

    walking += 1;
    started = true;
    order = wanted;
    item = subject;
    rows = [];
    after = undefined;
    more = false;
    answered = false;
    void walk(undefined);
  },

  next(): void {
    if (!loading && after !== undefined) void walk(after);
  },

  /**
   * These rows are the pool's, held here because the client holds no page for
   * them — so a sign-out drops them with everything else it cached.
   */
  forget(): void {
    walking += 1;
    started = false;
    order = "newest-first";
    item = undefined;
    rows = [];
    after = undefined;
    more = false;
    answered = false;
    refused = undefined;
  },
};
