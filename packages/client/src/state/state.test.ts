import { describe, expect, it } from "vitest";

import type { ItemId, RoutingRecord } from "../api/types";
import { anItem } from "../testing/pool";
import {
  cached,
  emptyState,
  processed,
  summarise,
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
      target: {},
    },
    state,
    at: "now",
  };
}

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
  };

  for (const [name, records] of Object.entries(cases)) {
    it(name, () => {
      expect(holding(...records).items.get(ITEM)?.routing).toEqual(
        summarise(records),
      );
    });
  }
});
