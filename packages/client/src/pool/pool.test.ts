import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { PoolChanged } from "../errors";
import type { PendingOperation } from "#outbox/operations";
import { read, until } from "#testing/observing";
import { anItem, asked, routeOf } from "#testing/pool";
import {
  HEALTH,
  json,
  mockTransport,
  refusal,
  VERSION,
} from "#testing/transport";

function anOperation(
  operation: PendingOperation["operation"],
  state: PendingOperation["state"] = "pending",
): PendingOperation {
  return { id: "op-1", operation, at: "2026-08-17T11:00:00.000Z", state };
}

/** Lets everything a client starts on its own run to a stop. */
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

  it("backs off rather than spinning while the pool stays away, and caps at ten seconds", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));
    transport.unreachable(true);

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    const boot = transport.sent.length;
    await vi.advanceTimersByTimeAsync(60_000);

    // A second, two, four, eight, then the cap: eight in the first minute,
    // where a second apart throughout would be sixty.
    expect(transport.sent.length - boot).toBe(8);

    // Onto the tick after the minute, and then the cap holds either side of it:
    // ten seconds is one more probe and not two.
    await vi.advanceTimersByTimeAsync(5_000);
    const capped = transport.sent.length;

    await vi.advanceTimersByTimeAsync(9_999);
    expect(transport.sent.length).toBe(capped);

    await vi.advanceTimersByTimeAsync(1);
    expect(transport.sent.length).toBe(capped + 1);

    client.close();
  });

  it("comes back from an unwatched stretch on the soonest backoff, not the longest", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));
    transport.unreachable(true);

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();
    await vi.advanceTimersByTimeAsync(60_000);

    client.watched(false);
    await quiet();
    const idle = transport.sent.length;

    client.watched(true);
    await quiet();
    expect(transport.sent.length).toBe(idle + 1);

    // A second, not the ten the backoff had climbed to with nobody reading.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.sent.length).toBe(idle + 2);

    client.close();
  });

  it("does not spin on a pool that answers one request of a pair, and not the other", async () => {
    const store = createMemoryStore();
    await store.writeBlob(
      "asset-1",
      new File(["bytes"], "a photo.png", { type: "image/png" }),
    );
    await store.writeOperation(
      anOperation({
        kind: "capture",
        envelope: {
          id: "one",
          source: "web",
          sourceItemId: "one",
          capturedAt: "2026-08-17T11:00:00.000Z",
          payload: {
            type: "image",
            content: {},
            metadata: {},
            assets: [{ slot: "image", asset: "asset-1" }],
          },
        },
      }),
    );

    vi.useFakeTimers();
    // The upload lands and the capture does not, so every attempt reports the
    // pool as back and then gone again. It gives up answering anything after a
    // while, so a client that did spin fails this rather than hanging it.
    let answers = 0;
    const transport = mockTransport((request) => {
      answers += 1;
      return request.method === "PUT" && answers < 30
        ? json(201, { id: "asset-1", filename: "a photo.png", bytes: 5 })
        : json(503, {});
    });

    const client = createClient({ transport, store });
    await quiet();

    // A second attempt, with the first having left the pool out of reach: the
    // upload answering is a return arriving inside a drain, and a drain is what
    // a return would start.
    void client.drain();
    await quiet();

    expect(asked(transport).map(routeOf)).toEqual([
      "PUT /v1/assets/asset-1",
      "POST /v1/captures",
      "PUT /v1/assets/asset-1",
      "POST /v1/captures",
    ]);
    expect(read(client.outbox)[0]?.state).toBe("unreachable");
    client.close();
  });

  it("keeps asking a pool that answers, so a pool that stops is noticed", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    const boot = transport.sent.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(transport.sent.length - boot).toBe(3);

    transport.unreachable(true);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(read(client.reachable).yes).toBe(false);
    client.close();
  });

  it("asks nothing while nobody is watching, and asks at once when someone is", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    client.watched(false);
    const idle = transport.sent.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(transport.sent.length).toBe(idle);

    client.watched(true);
    await quiet();

    expect(transport.sent.length).toBe(idle + 1);
    client.close();
  });

  it("does not probe a pool that is answering everything else", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, anItem("one")));

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    const boot = transport.sent.length;
    for (let reads = 0; reads < 3; reads += 1) {
      await vi.advanceTimersByTimeAsync(9_000);
      await client.item("one");
    }

    // Each answer pushes the probe out, so a client being used never sends one.
    expect(
      transport.sent
        .slice(boot)
        .map(routeOf)
        .filter((route) => route === HEALTH),
    ).toEqual([]);
    client.close();
  });

  it("reads a daemon that cannot answer as out of reach, not as an answer", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));
    // A 5xx is the pool failing to decide, which is not evidence of reach.
    transport.health = () => json(503, {});

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    expect(read(client.reachable).yes).toBe(false);
    client.close();
  });

  it("counts a refusal as reach, because the pool answered to make it", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, {}));
    transport.health = () => refusal(404, "no-such-item");

    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    expect(read(client.reachable).yes).toBe(true);
    client.close();
  });

  it("says nothing about when, until something has actually answered", async () => {
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });

    // Optimistic, and honest about being optimistic: nothing has answered yet.
    expect(read(client.reachable)).toEqual({ yes: true });
    client.close();
  });

  it("says when it was last answered, whatever asked", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({
      transport,
      store: createMemoryStore(),
      now: () => "2026-09-02T09:00:00.000Z",
    });
    await quiet();

    // The probe measures its own round trip, which nothing else can.
    await client.probe();
    expect(read(client.reachable).ms).toBeTypeOf("number");

    // An ordinary read is evidence of reach too, and carries no timing with it.
    await client.loadFeed();
    expect(read(client.reachable)).toEqual({
      yes: true,
      at: "2026-09-02T09:00:00.000Z",
      version: VERSION,
    });
    client.close();
  });

  it("carries the version the health probe last answered, on every mark after it", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    expect(read(client.reachable).version).toBe(VERSION);

    // An ordinary request settles the mark too, and must not drop what the
    // health probe already learned.
    await client.loadFeed();
    expect(read(client.reachable).version).toBe(VERSION);
    client.close();
  });

  it("drains once on a return, however many answers arrive after it", async () => {
    vi.useFakeTimers();
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });
    await quiet();

    transport.unreachable(true);
    await client.loadFeed().catch(() => undefined);
    expect(read(client.reachable).yes).toBe(false);

    transport.unreachable(false);
    const before = transport.sent.length;
    await client.loadFeed();
    await quiet();
    const onTheReturn = transport.sent.length - before;

    // Every answer settles the mark now, so only the flip may drain: without
    // that, each subsequent answer would start another read of every surface.
    await client.loadFeed();
    await quiet();
    expect(transport.sent.length - before).toBeLessThan(onTheReturn * 2);
    client.close();
  });

  it("says whether the pool is answering, and changes its mind on evidence", async () => {
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });

    expect(read(client.reachable).yes).toBe(true);

    transport.unreachable(true);
    await client.loadFeed();
    expect(read(client.reachable).yes).toBe(false);

    transport.unreachable(false);
    await client.loadFeed();
    expect(read(client.reachable).yes).toBe(true);
    client.close();
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

  it("keeps what it holds when the daemon answers no identity at all", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    await store.writePoolIdentity("the-pool-that-was");

    const transport = mockTransport(() => json(200, { values: [] }));
    transport.health = () => json(200, {});

    const reported: unknown[] = [];
    const client = createClient({
      transport,
      store,
      onError: (error) => reported.push(error),
    });
    await until(() => read(client.queue).items.length > 0);

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["one"]);
    expect(reported).toEqual([]);
    expect(await store.readPoolIdentity()).toBe("the-pool-that-was");
    client.close();
  });

  it("asks who the pool is once, on start", async () => {
    const transport = mockTransport(() => json(200, { values: [] }));
    const client = createClient({ transport, store: createMemoryStore() });
    await client.drain();

    expect(
      transport.sent.map(routeOf).filter((r) => r === "GET /v1/health"),
    ).toHaveLength(1);
    expect(asked(transport)).toEqual([]);
  });
});
