import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { PoolChanged } from "../errors";
import type { PendingOperation } from "../outbox/operations";
import { read, until } from "../testing/observing";
import { anItem, asked, routeOf } from "../testing/pool";
import { json, mockTransport } from "../testing/transport";

function anOperation(
  operation: PendingOperation["operation"],
  state: PendingOperation["state"] = "pending",
): PendingOperation {
  return { id: "op-1", operation, at: "2026-08-17T11:00:00.000Z", state };
}

/** Lets everything a client starts on its own run to a stop, with time held still. */
async function quiet(): Promise<void> {
  for (let turns = 0; turns < 20; turns += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("reachability", () => {
  it("drains what a previous session left, once the pool comes back, unprompted", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    await store.writeOperation(anOperation({ kind: "archive", item: "one" }));

    vi.useFakeTimers();
    const reached: string[] = [];
    const transport = mockTransport((request) => {
      reached.push(routeOf(request));
      return json(200, anItem("one"));
    });
    transport.unreachable(true);

    const client = createClient({ transport, store });
    await quiet();
    expect(reached).toEqual([]);

    transport.unreachable(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await quiet();

    expect(reached).toEqual(["POST /v1/items/one/archive"]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("backs off rather than spinning while the pool stays away", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));
    transport.unreachable(true);

    createClient({ transport, store: createMemoryStore() });
    await quiet();

    const boot = transport.sent.length;
    await vi.advanceTimersByTimeAsync(60_000);
    const probes = transport.sent.length - boot;

    // A second apart throughout would be sixty of them.
    expect(probes).toBeGreaterThan(2);
    expect(probes).toBeLessThan(10);
  });

  it("stops asking once the pool answers", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));

    createClient({ transport, store: createMemoryStore() });
    await quiet();

    const boot = transport.sent.length;
    await vi.advanceTimersByTimeAsync(120_000);

    expect(transport.sent.length).toBe(boot);
  });
});

describe("a pool that is not the one we cached", () => {
  it("drops what it holds for the old one, keeps the outbox, and says so", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    await store.writePoolIdentity("the-pool-that-was");
    // Refused, so no drain touches it: this is about the rebuild, not the outbox.
    await store.writeOperation(
      anOperation({ kind: "archive", item: "one" }, "refused"),
    );

    const transport = mockTransport(() => json(200, { values: [] }));
    transport.pool = "the-pool-that-is";

    const reported: unknown[] = [];
    const client = createClient({
      transport,
      store,
      onError: (error) => reported.push(error),
    });
    await until(() => reported.length > 0);

    expect(reported[0]).toBeInstanceOf(PoolChanged);
    expect(read(client.queue).items).toEqual([]);
    expect(read(client.outbox)).toHaveLength(1);

    await until(async () => (await store.readItems()).length === 0);
    expect(await store.readItems()).toEqual([]);
    expect(await store.readOutbox()).toHaveLength(1);
    expect(await store.readPoolIdentity()).toBe("the-pool-that-is");
  });

  it("takes the identity of a pool it has never cached without dropping anything", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);

    const transport = mockTransport(() => json(200, { values: [] }));
    const reported: unknown[] = [];
    const client = createClient({
      transport,
      store,
      onError: (error) => reported.push(error),
    });
    await until(() => read(client.queue).items.length > 0);

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["one"]);
    expect(reported).toEqual([]);
    expect(await store.readPoolIdentity()).toBe(transport.pool);
  });

  it("asks who the pool is once, on start", async () => {
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });
    await client.drain();

    expect(transport.sent.map(routeOf).filter((r) => r === "GET /v1/health"))
      .toHaveLength(1);
    expect(asked(transport)).toEqual([]);
  });
});
