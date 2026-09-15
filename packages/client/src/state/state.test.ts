import { describe, expect, it } from "vitest";

import type { ItemId, RoutingRecord } from "#api/types";
import { anItem } from "#testing/pool";
import {
  arrived,
  cached,
  emptyState,
  processed,
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
