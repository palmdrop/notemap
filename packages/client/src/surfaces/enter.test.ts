import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "#testing/observing";
import { anItem, routeOf } from "#testing/pool";
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

/**
 * Two pages of one item each, and what the second read of the first page
 * answers is the test's to change: an item processed while the reader was
 * somewhere else is the whole case.
 */
function paged(surface: string, pages: Record<string, unknown>[][]) {
  let turns = 0;
  return (request: Request) => {
    if (routeOf(request) !== `GET /v1/${surface}`)
      return json(200, { values: [] });

    const after = new URL(request.url).searchParams.get("after");
    if (after !== null) return json(200, { values: pages[1] ?? [] });

    const values = pages[Math.min(turns, pages.length - 1)] ?? [];
    turns += 1;
    return json(200, { values, next: `/v1/${surface}?after=one` });
  };
}

describe("arriving at a surface", () => {
  it("reads the queue again, dropping what the pool no longer names", async () => {
    const { client } = clientOver(
      paged("queue", [[anItem("one")], [anItem("two")]]),
    );

    await client.enter("queue");
    await client.loadQueue();
    expect(ids(read(client.queue))).toEqual(["one", "two"]);

    // Away and back. The first page answers differently, because "one" was
    // routed by a trigger tag while the reader was on another surface.
    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["two"]);
  });

  it("keeps what the feed walked, nothing ever leaving it", async () => {
    const { client } = clientOver(
      paged("feed", [[anItem("one")], [anItem("two")]]),
    );

    await client.enter("feed");
    await client.loadFeed();
    expect(ids(read(client.feed))).toEqual(["one", "two"]);

    await client.enter("feed");
    expect(ids(read(client.feed))).toEqual(["one", "two"]);
  });

  it("reads a surface nobody has read yet for the first time", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [anItem("one")] }),
    );

    await client.enter("queue");

    expect(ids(read(client.queue))).toEqual(["one"]);
    expect(
      transport.sent.map(routeOf).filter((route) => route === "GET /v1/queue"),
    ).toHaveLength(1);
  });

  it("keeps what it had when the read it arrived with fails", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [anItem("one")], next: "/v1/queue?after=one" }),
    );

    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["one"]);

    transport.unreachable(true);
    await client.enter("queue");

    // A read that failed is not a reason to have less than before it was made.
    expect(ids(read(client.queue))).toEqual(["one"]);
  });
});
