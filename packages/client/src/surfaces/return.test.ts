import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import type { PendingOperation } from "../outbox/operations";
import { read } from "../testing/observing";
import { anItem, routeOf } from "../testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "../testing/transport";
import type { Client, ListState } from "../types";

const ids = (list: ListState) => list.items.map((item) => item.id);

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
  vi.useRealTimers();
});

/** Lets everything a client starts on its own run to a stop. */
async function quiet(): Promise<void> {
  for (let turns = 0; turns < 20; turns += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

function clientOver(handler: Handler, store = createMemoryStore()) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store });
  built.push(client);
  return { client, transport };
}

/** Every route but the probe, which every client asks on its own schedule. */
function asked(transport: { readonly sent: readonly Request[] }): string[] {
  return transport.sent
    .map(routeOf)
    .filter((route) => route !== "GET /v1/health");
}

/** Waits out the backoff the probe is on, then lets the return settle. */
async function comesBack(transport: {
  unreachable(failing: boolean): void;
}): Promise<void> {
  transport.unreachable(false);
  await vi.advanceTimersByTimeAsync(30_000);
  await quiet();
}

describe("a pool that comes back", () => {
  it("reads a cache-drawn surface again, and the pool's page replaces what was drawn", async () => {
    vi.useFakeTimers();
    const store = createMemoryStore();
    await store.writeItems([anItem("cached")]);

    const { client, transport } = clientOver(
      () => json(200, { values: [anItem("answered")] }),
      store,
    );
    transport.unreachable(true);
    await quiet();

    await client.loadQueue();
    expect(read(client.queue).fromCache).toBe(true);
    expect(ids(read(client.queue))).toEqual(["cached"]);

    await comesBack(transport);

    expect(read(client.queue).fromCache).toBe(false);
    expect(read(client.queue).failure).toBeUndefined();
    expect(ids(read(client.queue))).toEqual(["answered"]);
  });

  it("leaves a surface that walked real pages holding them, and drops only the failure", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(() =>
      json(200, { values: [anItem("one")], next: "/v1/queue?after=one" }),
    );
    await quiet();

    await client.loadQueue();
    expect(ids(read(client.queue))).toEqual(["one"]);

    transport.unreachable(true);
    await client.loadQueue();
    expect(read(client.queue).failure).toBeDefined();

    const walked = asked(transport).length;
    await comesBack(transport);

    expect(read(client.queue).failure).toBeUndefined();
    expect(ids(read(client.queue))).toEqual(["one"]);
    // Its pages are still the reader's to walk; nothing was thrown away to
    // answer the reconnect.
    expect(asked(transport).length).toBe(walked);
    expect(read(client.queue).more).toBe(true);
  });

  it("leaves a surface nobody has asked for cold", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(() =>
      json(200, { values: [anItem("one")] }),
    );
    await quiet();

    await client.loadQueue();
    transport.unreachable(true);
    await client.loadQueue();
    await comesBack(transport);

    expect(asked(transport)).not.toContain("GET /v1/feed");
  });

  it("keeps a refusal, which the pool answering again does not undo", async () => {
    vi.useFakeTimers();
    // A page with more behind it: an exhausted surface has no second read to
    // refuse.
    let answering: Handler = () =>
      json(200, { values: [anItem("one")], next: "/v1/queue?after=one" });

    const { client, transport } = clientOver((request) => answering(request));
    await quiet();

    await client.loadQueue();
    answering = () => refusal(422, "bad-position");
    await client.loadQueue();

    expect(read(client.queue).failure).toEqual({
      said: "the app lost its place in the list; reload",
      refused: true,
    });

    // Out of reach and back, without touching the surface: only a read of its
    // own would replace what the pool already answered for it.
    transport.unreachable(true);
    await client.destinations.load().catch(() => undefined);
    await comesBack(transport);

    expect(read(client.queue).failure?.refused).toBe(true);
  });

  it("reads the surfaces after the drain, so the page holds what was waiting", async () => {
    vi.useFakeTimers();
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    const held: PendingOperation = {
      id: "op-1",
      operation: { kind: "archive", item: "one" },
      at: "2026-08-26T11:00:00.000Z",
      state: "pending",
    };
    await store.writeOperation(held);

    const { client, transport } = clientOver(
      () => json(200, { values: [] }),
      store,
    );
    transport.unreachable(true);
    await quiet();

    await client.loadQueue();
    await comesBack(transport);

    const routes = asked(transport);
    expect(routes).toContain("POST /v1/items/one/archive");
    expect(routes.indexOf("POST /v1/items/one/archive")).toBeLessThan(
      routes.indexOf("GET /v1/queue"),
    );
  });
});
