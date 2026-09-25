import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "#testing/observing";
import { anItem, asked, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";
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

/** Where a queue read was told to start, in the order it was asked in. */
function walked(transport: { readonly sent: readonly Request[] }) {
  return asked(transport)
    .filter((request) => routeOf(request) === "GET /v1/queue")
    .map((request) => {
      const query = new URL(request.url).searchParams;
      return { order: query.get("order"), after: query.get("after") };
    });
}

describe("a read that is still in flight", () => {
  it("does not carry back a row that left the surface while it was", async () => {
    let reading!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => (reading = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));

    const { client } = clientOver(async (request) => {
      if (routeOf(request) !== "GET /v1/queue")
        return json(200, { values: [] });

      if (new URL(request.url).searchParams.get("after") === null)
        return json(200, {
          values: [anItem("one"), anItem("two")],
          next: "/v1/queue?after=two",
        });

      // The second page is held open, so the test has a moment inside the read.
      reading();
      await held;
      return json(200, { values: [anItem("three")] });
    });

    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["one", "two"]);

    const walking = client.loadQueue();
    await started;
    await client.archive("one");
    release();
    await walking;

    // The page the read answered for still had "one" in it. It left while the
    // pool was answering, and a read is not a way back onto the queue.
    expect(ids(read(client.queue))).toEqual(["two", "three"]);
  });
});

/**
 * What the surface draws after a turn it could not read is `cache.test.ts`'s.
 * This is the position it is left holding, which nothing else asks about and
 * which the next read is the only place it shows.
 */
describe("a turn the pool did not answer", () => {
  it("leaves the surface no position the new order cannot be read from", async () => {
    const { client, transport } = clientOver(() =>
      json(200, {
        values: [anItem("one"), anItem("two")],
        next: "/v1/queue?after=two",
      }),
    );

    await client.enter("queue");
    const first = read(client.queue).order;
    const turned = first === "newest-first" ? "oldest-first" : "newest-first";

    transport.unreachable(true);
    await client.loadQueue(turned);

    expect(read(client.queue).failure).toBeDefined();

    transport.unreachable(false);
    await client.loadQueue();

    // Read from the new order's own start, not from a position the old one
    // handed back — which would answer for rows nobody asked for.
    expect(walked(transport).at(-1)).toEqual({ order: turned, after: null });
  });
});

/**
 * A shell tells a read's rows from a change by the emission they arrive in: the
 * one that ends the read. Were they to land first and the read end after, a
 * page would draw as though every row on it had just arrived.
 */
describe("a read's answer", () => {
  it("lands in the same emission that ends the read, and in no other", async () => {
    const { client } = clientOver((request) => {
      if (routeOf(request) !== "GET /v1/queue")
        return json(200, { values: [] });
      return new URL(request.url).searchParams.get("after") === null
        ? json(200, {
            values: [anItem("one"), anItem("two")],
            next: "/v1/queue?after=two",
          })
        : json(200, { values: [anItem("three")] });
    });

    const seen: ListState[] = [];
    const watching = client.queue.subscribe((list) => seen.push(list));

    await client.enter("queue");
    await client.loadQueue();
    watching.unsubscribe();

    const grew = seen.flatMap((list, at) => {
      const before = seen[at - 1];
      return before !== undefined && list.items.length > before.items.length
        ? [{ before, list }]
        : [];
    });

    expect(grew.map(({ list }) => ids(list))).toEqual([
      ["one", "two"],
      ["one", "two", "three"],
    ]);
    for (const { before, list } of grew) {
      expect(before.loading).toBe(true);
      expect(list.loading).toBe(false);
    }
  });
});
