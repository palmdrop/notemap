import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import type { Item } from "./api/types";
import { createClient } from "./client";
import type { ClientStore } from "./ports/store";
import { read, until } from "./testing/observing";
import { anItem, routeOf, stoppedClock } from "./testing/pool";
import { json, mockTransport, type Handler } from "./testing/transport";
import type { Client, ListState } from "./types";

const clock = stoppedClock();

const ids = (list: ListState) => list.items.map((item) => item.id);

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

function clientOver(store: ClientStore, handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store, now: clock.now });
  built.push(client);
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

  it("stays on the pool's page through a turn, rather than flashing the cache", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("cached", 2019), at("also-cached", 2018)]);

    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { client } = clientOver(store, async (request) => {
      const query = new URL(request.url).searchParams;
      if (query.get("order") === "newest-first") await held;
      return json(200, { values: [at("answered", 2021)] });
    });
    await until(() => ids(read(client.queue)).length > 0);

    await client.loadQueue();
    expect(read(client.queue).fromCache).toBe(false);

    const turning = client.loadQueue("newest-first");
    await until(() => read(client.queue).loading);

    // Mid-turn the surface holds nothing, and says so — rather than reporting
    // the whole cache as its own and then snapping back to one row.
    expect(read(client.queue).fromCache).toBe(false);
    expect(ids(read(client.queue))).toEqual([]);

    release();
    await turning;
    expect(ids(read(client.queue))).toEqual(["answered"]);
  });

  it("gives the pool's claim up when a turn cannot be read, and draws the cache", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("cached", 2019)]);

    const { client, transport } = clientOver(store, (request) =>
      routeOf(request) === "GET /v1/queue"
        ? json(200, { values: [at("answered", 2021)] })
        : json(200, { values: [] }),
    );
    await until(() => ids(read(client.queue)).length > 0);

    await client.loadQueue();
    expect(read(client.queue).fromCache).toBe(false);

    transport.unreachable(true);
    await client.loadQueue("newest-first");

    expect(read(client.queue).fromCache).toBe(true);
    // Everything the client holds, in the order it was turned to — the row the
    // pool answered earlier is cached like any other.
    expect(ids(read(client.queue))).toEqual(["answered", "cached"]);
    expect(read(client.queue).failure).toBeDefined();
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

describe("one item, read", () => {
  it("reaches the pool for an id no surface has drawn", async () => {
    const { client, transport } = clientOver(createMemoryStore(), (request) =>
      routeOf(request) === "GET /v1/items/linked"
        ? json(200, at("linked", 2021))
        : nothing(),
    );

    const drawn = await client.item("linked");

    expect(drawn.item?.id).toBe("linked");
    expect(drawn.fromCache).toBe(false);
    expect(transport.sent.map(routeOf)).toContain("GET /v1/items/linked");
  });

  it("says there is no such item without saying anything failed", async () => {
    const { client } = clientOver(createMemoryStore(), (request) =>
      routeOf(request) === "GET /v1/items/gone"
        ? json(404, { error: { code: "no-such-item" } })
        : nothing(),
    );

    const drawn = await client.item("gone");

    expect(drawn.item).toBeUndefined();
    expect(drawn.failure).toBeUndefined();
    expect(drawn.fromCache).toBe(false);
  });

  it("falls back to what it holds when the pool does not answer, and says so", async () => {
    const store = createMemoryStore();
    await store.writeItems([at("cached", 2020)]);

    const { client, transport } = clientOver(store, nothing);
    await until(() => ids(read(client.queue)).length > 0);
    transport.unreachable(true);

    const drawn = await client.item("cached");

    expect(drawn.item?.id).toBe("cached");
    expect(drawn.fromCache).toBe(true);
    expect(drawn.failure?.refused).toBe(false);
  });

  it("holds nothing for an id it never cached, and says why", async () => {
    const { client, transport } = clientOver(createMemoryStore(), nothing);
    transport.unreachable(true);

    const drawn = await client.item("never");

    expect(drawn.item).toBeUndefined();
    expect(drawn.fromCache).toBe(false);
    expect(drawn.failure?.refused).toBe(false);
  });
});
