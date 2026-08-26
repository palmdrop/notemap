import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import type { Item } from "./api/types";
import { createClient } from "./client";
import type { ClientStore } from "./ports/store";
import { read, until } from "./testing/observing";
import { anItem, routeOf, stoppedClock } from "./testing/pool";
import { json, mockTransport, type Handler } from "./testing/transport";
import type { ListState } from "./types";

const clock = stoppedClock();

const ids = (list: ListState) => list.items.map((item) => item.id);

function clientOver(store: ClientStore, handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store, now: clock.now });
  return { client, transport };
}

const nothing = () => json(200, { values: [] });

function at(id: string, year: number, overrides: Partial<Item> = {}): Item {
  return anItem(id, {
    createdAt: `${String(year)}-01-01T00:00:00.000Z`,
    ...overrides,
  });
}

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("a surface drawn from the cache", () => {
  it("draws both surfaces from a cold store with no transport to ask", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("older", 2020), at("newer", 2021)]);

    const { client, transport } = clientOver(store, nothing);
    transport.unreachable(true);
    await until(() => ids(read(client.queue)).length > 0);

    expect(ids(read(client.queue))).toEqual(["older", "newer"]);
    expect(ids(read(client.feed))).toEqual(["newer", "older"]);
    expect(read(client.queue).fromCache).toBe(true);
    expect(read(client.queue).loading).toBe(false);
  });

  it("keeps a routed, an archived and a revised-from item out of the queue", async () => {
    const store = createMemoryStore();
    await store.writeItems([
      at("work", 2020),
      at("routed", 2021, {
        routing: { records: 1, pending: 0, to: [{ kind: "user" }] },
      }),
      at("archived", 2022, {
        archived: { archivedAt: "2022-06-01T00:00:00.000Z" },
      }),
      at("revised", 2023, { revisedInto: ["work"] }),
    ]);

    const { client, transport } = clientOver(store, nothing);
    transport.unreachable(true);
    await until(() => ids(read(client.queue)).length > 0);

    expect(ids(read(client.queue))).toEqual(["work"]);
    // The feed is the pool read completely, so every one of them is in it.
    expect(ids(read(client.feed))).toEqual([
      "revised",
      "archived",
      "routed",
      "work",
    ]);
  });

  it("places a capture made with the pool down at its own capture time", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("older", 2020)]);

    const { client, transport } = clientOver(store, nothing);
    transport.unreachable(true);
    await until(() => ids(read(client.queue)).length > 0);

    const fresh = await client.capture({
      channel: "web",
      text: "with the pool down",
    });

    expect(ids(read(client.queue))).toEqual(["older", fresh.id]);
    expect(ids(read(client.feed))).toEqual([fresh.id, "older"]);
  });

  it("replaces the cache with the first page the pool answers, rather than extending it", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("cached", 2020)]);

    const { client } = clientOver(store, (request) =>
      routeOf(request) === "GET /v1/queue"
        ? json(200, { values: [at("answered", 2021)] })
        : json(200, { values: [] }),
    );
    await until(() => ids(read(client.queue)).length > 0);

    await client.loadQueue();

    expect(ids(read(client.queue))).toEqual(["answered"]);
    expect(read(client.queue).fromCache).toBe(false);
  });

  it("stays on the cache when the read fails, and says what went wrong", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("cached", 2020)]);

    const { client, transport } = clientOver(store, nothing);
    transport.unreachable(true);
    await until(() => ids(read(client.queue)).length > 0);

    await client.loadQueue();

    expect(ids(read(client.queue))).toEqual(["cached"]);
    expect(read(client.queue).fromCache).toBe(true);
    expect(read(client.queue).failure).toBeDefined();
  });
});
