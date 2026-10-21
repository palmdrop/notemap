import { describe, expect, it } from "vitest";

import type { ItemId, RoutingRecord } from "#api/types";
import { anItem } from "#testing/pool";
import {
  arrived,
  belongs,
  cached,
  drawnFrom,
  emptyPage,
  emptyState,
  filterFor,
  filterOf,
  filterSize,
  heard,
  isWhole,
  processed,
  reconciled,
  resorted,
  sameFilter,
  processedLater,
  summarise,
  withIds,
  type ClientState,
} from "./state";

const ITEM = "one" as ItemId;

function holding(...records: readonly RoutingRecord[]): ClientState {
  const empty = emptyState();
  const state = { ...empty, items: cached(empty, [anItem(ITEM)]) };
  return records.reduce((held, record) => processed(held, ITEM, record), state);
}

function toUser(id: string, state: RoutingRecord["state"]): RoutingRecord {
  return { id, item: ITEM, target: { kind: "user" }, state, at: "now" };
}

function toVault(
  id: string,
  destination: string,
  state: RoutingRecord["state"],
): RoutingRecord {
  return {
    id,
    item: ITEM,
    target: {
      kind: "destination",
      destination,
      capability: "create",
      arguments: {},
    },
    state,
    at: "now",
  };
}

const viaResearch = { template: "tpl-research", firedByTag: true };

/**
 * The fold and `summarise` are two implementations of one answer — one built a
 * record at a time from what the pool returned, one built from the records
 * themselves — and a surface cannot tell which produced what it draws. So each
 * case is checked against the other rather than against a written-out expectation.
 */
describe("folding a routing decision matches summarising the records", () => {
  const cases: Record<string, readonly RoutingRecord[]> = {
    "one record onto an item that has been nowhere": [
      toVault("r1", "vault", "pending"),
    ],
    "a second record onto a summary already held": [
      toVault("r1", "vault", "delivered"),
      toUser("r2", "delivered"),
    ],
    "the same destination twice, which names it once": [
      toVault("r1", "vault", "delivered"),
      toVault("r2", "vault", "pending"),
    ],
    "two destinations, in the order the records were made": [
      toVault("r1", "vault", "delivered"),
      toVault("r2", "board", "delivered"),
    ],
    "pending crossing more than one record": [
      toVault("r1", "vault", "pending"),
      toVault("r2", "board", "pending"),
      toUser("r3", "delivered"),
    ],
    "the same template twice, which names it once": [
      { ...toVault("r1", "vault", "delivered"), applied: viaResearch },
      { ...toVault("r2", "vault", "delivered"), applied: viaResearch },
      toVault("r3", "vault", "delivered"),
    ],
  };

  for (const [name, records] of Object.entries(cases)) {
    it(name, () => {
      expect(holding(...records).items.get(ITEM)?.routing).toEqual(
        summarise(records),
      );
    });
  }

  it("names the templates whose records stand, once each", () => {
    const records = cases["the same template twice, which names it once"] ?? [];
    expect(summarise(records)?.templates).toEqual(["tpl-research"]);
  });
});

/**
 * Both surfaces read one key, so where an arrival lands is the order's answer
 * rather than the surface's. Reading oldest-first it is past the far end of
 * every page but the last.
 */
describe("where an arrival lands", () => {
  const OLD = "2026-08-17T09:00:00.000Z";
  const NEW = "2026-08-17T18:00:00.000Z";

  function feed(
    order: "newest-first" | "oldest-first",
    read: Partial<ClientState["feed"]>,
  ): ClientState {
    const empty = emptyState();
    const held = anItem("held", { createdAt: OLD });
    return {
      ...empty,
      items: cached(empty, [held]),
      feed: {
        ...withIds({ ...empty.feed, order }, ["held" as ItemId]),
        ...read,
      },
    };
  }

  const arriving = () => anItem("new", { createdAt: NEW });

  it("goes to the head reading newest-first", () => {
    const state = arrived(
      feed("newest-first", { after: `${OLD},held` }),
      arriving(),
    );
    expect(state.feed.ids).toEqual(["new", "held"]);
  });

  it("waits for the pool reading oldest-first, being past what was read", () => {
    const state = arrived(
      feed("oldest-first", { after: `${OLD},held` }),
      arriving(),
    );
    expect(state.feed.ids).toEqual(["held"]);
  });

  it("goes to the far end reading oldest-first once the page is exhausted", () => {
    const state = arrived(
      feed("oldest-first", { exhausted: true }),
      arriving(),
    );
    expect(state.feed.ids).toEqual(["held", "new"]);
  });
});

describe("a filter", () => {
  const ROUTED = anItem("routed", {
    routing: {
      records: 1,
      pending: 1,
      to: [{ kind: "destination", destination: "vault" }],
      templates: [],
    },
  });
  const MARKED = anItem("marked", {
    routing: { records: 1, pending: 0, to: [{ kind: "user" }], templates: [] },
  });
  const ARCHIVED = anItem("archived", {
    archived: { archivedAt: "2026-08-17T11:00:00.000Z" },
  });
  const REVISED = anItem("revised", { revisedInto: ["later"] });
  const RELAYED = anItem("relayed", { source: "memos" });
  const ALL = [ROUTED, MARKED, ARCHIVED, REVISED, RELAYED];

  const through = (named: Parameters<typeof filterOf>[0]) =>
    ALL.filter((item) =>
      belongs("feed", emptyPage("newest-first", filterOf(named)), item),
    ).map((item) => item.id);

  it("is tidied: tags trimmed, ids not, blanks and unknown states dropped, one of each", () => {
    expect(
      filterOf({
        tags: [" kind/quote ", "kind/quote", ""],
        states: ["routed", "processed", "routed"],
        destinations: [" vault", ""],
        sources: ["memos", "memos"],
      }),
    ).toEqual({
      tags: ["kind/quote"],
      states: ["routed"],
      destinations: [" vault"],
      sources: ["memos"],
    });
  });

  it("counts everything it names, and is whole naming nothing", () => {
    const filter = filterOf({
      tags: ["a"],
      states: ["routed"],
      sources: ["m"],
    });
    expect(filterSize(filter)).toBe(3);
    expect(
      filterSize(filterOf({ destinations: ["v", "w"], sources: ["m"] })),
    ).toBe(3);
    expect(isWhole(filter)).toBe(false);
    expect(isWhole(filterOf({ tags: [" "] }))).toBe(true);
    expect(sameFilter(filter, filterOf({ tags: ["a"], sources: ["m"] }))).toBe(
      false,
    );
  });

  it("keeps the queue to its tags and sources", () => {
    const named = filterOf({
      tags: ["a"],
      states: ["routed"],
      destinations: ["vault"],
      sources: ["m"],
    });
    expect(filterFor("queue", named)).toEqual(
      filterOf({ tags: ["a"], sources: ["m"] }),
    );
    expect(filterFor("feed", named)).toEqual(named);
  });

  it("holds an item in any one of the states named", () => {
    expect(through({ states: ["routed"] })).toEqual(["routed", "marked"]);
    expect(through({ states: ["archived", "revised"] })).toEqual([
      "archived",
      "revised",
    ]);
    expect(through({ states: ["unprocessed"] })).toEqual(["relayed"]);
  });

  it("reads a destination from the routing summary, and never a mark by hand", () => {
    expect(through({ destinations: ["vault"] })).toEqual(["routed"]);
    expect(through({ destinations: ["elsewhere"] })).toEqual([]);
  });

  it("reads the source an item came through, and holds every kind at once", () => {
    expect(through({ sources: ["memos"] })).toEqual(["relayed"]);
    expect(through({ sources: ["memos"], states: ["routed"] })).toEqual([]);
    expect(through({})).toHaveLength(ALL.length);
  });
});

describe("a page read by when items were processed", () => {
  const minute = (m: number) =>
    `2026-08-17T10:${String(m).padStart(2, "0")}:00.000Z`;
  const ONE = anItem("one", { createdAt: minute(1), processedAt: minute(9) });
  const TWO = anItem("two", { createdAt: minute(2) });

  function holding(by: "capture" | "processed"): ClientState {
    const empty = emptyState();
    const page = {
      ...emptyPage("newest-first", undefined, by),
      exhausted: true,
    };
    return {
      ...empty,
      items: cached(empty, [ONE, TWO]),
      feed: { ...page, answered: false },
    };
  }

  it("is drawn from the cache by when each copy says it was processed", () => {
    expect(
      drawnFrom(holding("processed"), "feed").map((item) => item.id),
    ).toEqual(["one", "two"]);
    expect(
      drawnFrom(holding("capture"), "feed").map((item) => item.id),
    ).toEqual(["two", "one"]);
  });

  it("moves a held row where its key now sorts, and only on a page read by it", () => {
    const answered = (by: "capture" | "processed"): ClientState => {
      const state = holding(by);
      return {
        ...state,
        feed: { ...state.feed, ids: ["one", "two"], answered: true },
      };
    };
    const moved = (state: ClientState) =>
      resorted(
        { ...state, items: cached(state, [processedLater(TWO, minute(30))]) },
        TWO.id,
      ).feed.ids;

    expect(moved(answered("processed"))).toEqual(["two", "one"]);
    expect(moved(answered("capture"))).toEqual(["one", "two"]);
  });

  it("puts a row the pool answered for where its key now sorts, on a page read by it alone", () => {
    const answered = (by: "capture" | "processed"): ClientState => {
      const state = holding(by);
      return {
        ...state,
        feed: { ...state.feed, ids: ["one", "two"], answered: true },
      };
    };
    const settled = (state: ClientState) =>
      reconciled(
        { ...state, items: cached(state, [processedLater(TWO, minute(30))]) },
        TWO.id,
      ).feed.ids;

    expect(settled(answered("processed"))).toEqual(["two", "one"]);
    expect(settled(answered("capture"))).toEqual(["one", "two"]);
  });

  it("never moves the key back for a guess", () => {
    expect(processedLater(ONE, minute(5)).processedAt).toBe(minute(9));
    expect(processedLater(ONE, minute(10)).processedAt).toBe(minute(10));
  });

  it("reads an archived item again only while the feed is read by it, and never for an amendment", () => {
    const amended = {
      id: "a-0",
      kind: "amended",
      subject: "one",
      by: { kind: "person" },
      at: minute(40),
      detail: {},
    } as const;
    expect(
      heard(holding("processed"), [amended], new Set(), new Set()).read,
    ).toEqual([]);

    const action = {
      id: "a-1",
      kind: "archived",
      subject: "one",
      by: { kind: "person" },
      at: minute(40),
      detail: {},
    } as const;

    const read = (by: "capture" | "processed") =>
      heard(holding(by), [action], new Set(), new Set()).read;
    expect(read("processed")).toEqual(["one"]);
    expect(read("capture")).toEqual([]);

    const filteredByProcessed: ClientState = {
      ...holding("capture"),
      filtered: {
        feed: emptyPage("newest-first", filterOf({ tags: ["a"] }), "processed"),
      },
    };
    expect(
      heard(filteredByProcessed, [action], new Set(), new Set()).read,
    ).toEqual(["one"]);
  });
});
