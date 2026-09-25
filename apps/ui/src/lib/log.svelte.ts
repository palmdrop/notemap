import {
  Unreachable,
  saidBy,
  type Action,
  type ActionKind,
  type ActionPosition,
  type ItemId,
  type Order,
} from "@notemap/client";

import { SvelteSet } from "svelte/reactivity";

import { client } from "./client";

/**
 * The log's walked page. The client keeps no page for it and writes none of it
 * to the store, so the shell holds what has been read — at module level rather
 * than per component, which is what lets the chrome say how much is shown.
 */
let order = $state<Order>("newest-first");
let item = $state<ItemId | undefined>(undefined);
let kinds = $state<readonly ActionKind[] | undefined>(undefined);
let rows = $state<readonly Action[]>([]);
let after = $state<ActionPosition | undefined>(undefined);
let more = $state(false);
let loading = $state(false);
let answered = $state(false);
let refused = $state<string | undefined>(undefined);
let failed = $state(false);
/** What arrived from the watcher since the last read: the rows that move in. */
const heard = new SvelteSet<Action["id"]>();

/**
 * Which walk is the current one. A read that lands after the log has been
 * turned around is answering for a page that no longer exists.
 */
let walking = 0;

/** Whether anything has ever asked. Plain, so no effect can take a dependency on it. */
let asked = false;

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

/** The same, at the head: what has happened since the page was read. */
function ahead(
  held: readonly Action[],
  arriving: readonly Action[],
): readonly Action[] {
  const seen = new Set(held.map((action) => action.id));
  return [...arriving.filter((action) => !seen.has(action.id)), ...held];
}

async function walk(from: ActionPosition | undefined): Promise<void> {
  const mine = walking;
  loading = true;
  refused = undefined;
  failed = false;

  try {
    const page = await client.actions.read({
      order,
      ...(item === undefined ? {} : { item }),
      ...(kinds === undefined ? {} : { kinds }),
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
    if (mine === walking) failed = true;
    if (mine === walking && !(error instanceof Unreachable)) {
      refused = saidBy(error);
    }
  } finally {
    if (mine === walking) loading = false;
  }
}

function sameKinds(
  a: readonly ActionKind[] | undefined,
  b: readonly ActionKind[] | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((kind) => b.includes(kind));
}

/** Walks from the start: a position belongs to the order and the filter that made it. */
function restart(
  wanted: Order,
  subject: ItemId | undefined,
  narrowed: readonly ActionKind[] | undefined,
): void {
  walking += 1;
  asked = true;
  order = wanted;
  item = subject;
  kinds = narrowed;
  rows = [];
  heard.clear();
  after = undefined;
  more = false;
  answered = false;
  void walk(undefined);
}

export const log = {
  get order() {
    return order;
  },
  get item() {
    return item;
  },
  get kinds() {
    return kinds;
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
  /** A reading read from its start — a view, an order, a subject — not yet answered. */
  get turning() {
    return loading && !answered;
  },
  get failed() {
    return failed;
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
  /** Whether a row arrived from the watcher rather than with a read. */
  heard(id: Action["id"]): boolean {
    return heard.has(id);
  },

  /**
   * Reads the log as the URL names it. A page already answered for that reading
   * is kept — coming back to a surface is not a reason to throw away a long
   * walk — but a read that failed is not a page, so re-entering asks again.
   */
  reading(
    wanted: Order,
    subject: ItemId | undefined,
    narrowed?: readonly ActionKind[],
  ): void {
    const same =
      wanted === order && subject === item && sameKinds(narrowed, kinds);
    if (same && (answered || loading)) return;
    restart(wanted, subject, narrowed);
  },

  /**
   * What the pool has done since, put at the head of what is drawn. The watcher
   * asks on its own tempo for the corner to speak from, and this is the same
   * news read as a page — so a log left open stops being a photograph of the
   * moment it was opened.
   *
   * **Newest-first only.** Read the other way the page starts at the oldest
   * entry and what just happened belongs past the end of a walk nobody has
   * finished; putting it under page one would place it beside entries from
   * months before it. Read the other way round, the walk is what brings it.
   */
  arrived(actions: readonly Action[]): void {
    if (!answered || order !== "newest-first") return;

    const wanted = actions.filter(
      (action) =>
        (item === undefined || action.subject === item) &&
        (kinds === undefined || kinds.includes(action.kind)),
    );
    if (wanted.length === 0) return;

    for (const action of wanted) {
      if (!rows.some((one) => one.id === action.id)) heard.add(action.id);
    }
    rows = ahead(rows, [...wanted].reverse());
  },

  /**
   * More happened than one read answers, so what arrived is not what is
   * missing and the page is read again from the top.
   *
   * **Newest-first only, on the same rule.** Oldest-first the walk starts at
   * the oldest entry and grows towards the news, so nothing it holds went
   * stale — and throwing away ten walked pages to put somebody back at the
   * oldest entry is the reading this rule exists to protect.
   */
  raced(): void {
    if (!answered || order !== "newest-first") return;

    restart(order, item, kinds);
  },

  /**
   * Asks again where the last read left nothing. The client re-reads the feed
   * and the queue when the pool comes back into reach; this surface holds no
   * cache for it to keep, so it has to ask for itself or stay blank.
   */
  again(): void {
    if (asked && !answered && !loading) restart(order, item, kinds);
  },

  /**
   * Turned around by the control, which has to say so rather than write the URL
   * and leave this to notice: `replaceState` moves the address bar without
   * assigning `page.url`, so nothing here can be driven by reading it back.
   */
  turn(wanted: Order): void {
    restart(wanted, item, kinds);
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
    asked = false;
    loading = false;
    order = "newest-first";
    item = undefined;
    kinds = undefined;
    rows = [];
    heard.clear();
    after = undefined;
    more = false;
    answered = false;
    refused = undefined;
    failed = false;
  },
};
