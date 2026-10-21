import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "#testing/observing";
import { anItem, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";
import type { Item } from "#api/types";
import type { Client, ListState } from "../types";

const ids = (list: ListState) => list.items.map((item) => item.id);

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  built.push(client);
  return { client, transport };
}

const minute = (m: number) =>
  `2026-08-17T10:${String(m).padStart(2, "0")}:00.000Z`;

/** Captured at minutes 1, 2 and 3; the first processed since, at 9. */
const ITEMS: readonly Item[] = [
  anItem("one", { createdAt: minute(1), processedAt: minute(9) }),
  anItem("two", { createdAt: minute(2) }),
  anItem("three", { createdAt: minute(3) }),
];

/** The feed as a pool would answer it, newest first by the key asked for. */
function pool(items: readonly Item[] = ITEMS): Handler {
  return (request) => {
    const route = routeOf(request);
    if (route.startsWith("POST ") && route.endsWith("/mark-processed")) {
      const id = new URL(request.url).pathname.split("/")[3];
      return json(200, {
        id: `record-${id}`,
        item: id,
        target: { kind: "user" },
        state: "delivered",
        at: minute(20),
      });
    }
    if (route !== "GET /v1/feed") return json(200, { values: [] });
    const by = new URL(request.url).searchParams.get("by");
    const key = (item: Item) =>
      by === "processed" ? item.processedAt : item.createdAt;
    return json(200, {
      values: [...items].sort((a, b) => (key(a) < key(b) ? 1 : -1)),
    });
  };
}

describe("the feed read by when each item was processed", () => {
  it("asks the pool by processed, says so, and turns back by capture", async () => {
    const { client, transport } = clientOver(pool());

    await client.loadFeed(undefined, "processed");
    expect(ids(read(client.feed))).toEqual(["one", "three", "two"]);
    expect(read(client.feed).by).toBe("processed");

    await client.loadFeed(undefined, "capture");
    expect(ids(read(client.feed))).toEqual(["three", "two", "one"]);
    expect(
      transport.sent
        .filter((request) => routeOf(request) === "GET /v1/feed")
        .map((request) => new URL(request.url).searchParams.get("by")),
    ).toEqual(["processed", "capture"]);
  });

  it("moves a row this client marks processed to the head, by the record's own time", async () => {
    const { client } = clientOver(pool());

    await client.loadFeed(undefined, "processed");
    await client.routing.markProcessed("two");

    expect(ids(read(client.feed))).toEqual(["two", "one", "three"]);
    expect(read(client.feed).items[0]?.processedAt).toBe(minute(20));
  });

  it("leaves the feed read by capture where it was", async () => {
    const { client } = clientOver(pool());

    await client.loadFeed();
    await client.routing.markProcessed("one");

    expect(ids(read(client.feed))).toEqual(["three", "two", "one"]);
  });

  it("enters the feed through a filter by the key it is named", async () => {
    const { client, transport } = clientOver(pool());

    await client.enter("feed", undefined, { sources: ["test"] }, "processed");

    const asked = transport.sent.find(
      (request) => routeOf(request) === "GET /v1/feed",
    );
    expect(new URL(asked?.url ?? "http://pool").searchParams.get("by")).toBe(
      "processed",
    );
    expect(read(client.feed).by).toBe("processed");
  });
});
