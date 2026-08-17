import { beforeEach, describe, expect, it } from "vitest";

import type { Item } from "./api/types";
import { createMemoryStore } from "./adapters/memory-store";
import { createClient } from "./client";
import { Refused, Unreachable } from "./errors";
import type { Readable } from "./observable/observable";
import type { PendingOperation } from "./outbox/operations";
import { anItem, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";
import type { ListState } from "./types";

function read<T>(source: Readable<T>): T {
  let seen: T | undefined;
  source.subscribe((value) => {
    seen = value;
  })();
  return seen as T;
}

const clock = stoppedClock();

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const store = createMemoryStore();
  const client = createClient({ transport, store, now: clock.now });
  return { client, transport, store };
}

function captured(item: Item, kind = "captured") {
  return json(kind === "captured" ? 201 : 200, { kind, item, matchedOn: "id" });
}

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("capturing", () => {
  it("shows the capture before the pool answers, and settles on what it recorded", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { client } = clientOver(async (request) => {
      await held;
      const body = (await request.json()) as { id: string };
      return captured(anItem(body.id, { source: "web-manual" }));
    });

    const optimistic = await client.capture({
      channel: "web-manual",
      text: "before any round trip",
    });

    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      optimistic.id,
    ]);
    expect(read(client.feed).items[0]?.payload.content).toEqual({
      text: "before any round trip",
    });

    release();
    await client.drain();

    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      optimistic.id,
    ]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("stamps the channel it was given as the source", async () => {
    const { client, transport } = clientOver(async (request) => {
      const body = (await request.json()) as { id: string };
      return captured(anItem(body.id));
    });

    await client.capture({ channel: "web-image", text: "", asset: "asset-1" });
    await client.drain();

    const sent = (await transport.sent[0]!.json()) as {
      source: string;
      sourceItemId: string;
      id: string;
    };
    expect(sent.source).toBe("web-image");
    expect(sent.sourceItemId).toBe(sent.id);
  });

  it("takes an already-captured answer as agreement, not as a refusal", async () => {
    const { client } = clientOver(async (request) => {
      const body = (await request.json()) as { id: string };
      return captured(anItem(body.id), "already-captured");
    });

    const optimistic = await client.capture({ channel: "web", text: "again" });
    await client.drain();

    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      optimistic.id,
    ]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("rolls a refused capture back out of the feed and says why", async () => {
    const { client } = clientOver(() => refusal(409, "capture-id-conflict"));

    await client.capture({ channel: "web", text: "conflicting" });
    await client.drain();

    expect(read(client.feed).items).toEqual([]);

    const outbox = read(client.outbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.state).toBe("refused");
    expect(outbox[0]?.failure).toBe(
      "that capture already exists, with different content",
    );
  });

  it("keeps an unreachable capture in the outbox, applied to the local view", async () => {
    const { client, transport } = clientOver(() => json(201, {}));
    transport.unreachable(true);

    const optimistic = await client.capture({
      channel: "web",
      text: "offline",
    });
    await client.drain();

    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      optimistic.id,
    ]);
    expect(read(client.outbox)[0]?.state).toBe("unreachable");
  });

  it("sends an unreachable capture on the next drain, under the id it was given", async () => {
    const sent: string[] = [];
    const { client, transport } = clientOver(async (request) => {
      const body = (await request.json()) as { id: string };
      sent.push(body.id);
      return captured(anItem(body.id));
    });

    transport.unreachable(true);
    const optimistic = await client.capture({ channel: "web", text: "later" });
    await client.drain();

    transport.unreachable(false);
    await client.drain();

    expect(sent).toEqual([optimistic.id]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("forgets a refusal once it has been dismissed", async () => {
    const { client } = clientOver(() => refusal(409, "capture-id-conflict"));

    await client.capture({ channel: "web", text: "conflicting" });
    await client.drain();
    await client.dismiss(read(client.outbox)[0]!.id);

    expect(read(client.outbox)).toEqual([]);
  });
});

describe("the queue", () => {
  const queued = (...items: Item[]) => json(200, { values: items });

  it("reads oldest first and leaves an archived item behind", async () => {
    const { client } = clientOver((request) =>
      routeOf(request) === "GET /v1/queue"
        ? queued(anItem("older"), anItem("newer"))
        : json(200, { ...anItem("older"), archived: { archivedAt: "now" } }),
    );

    await client.loadQueue();
    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "older",
      "newer",
    ]);

    await client.archive("older", "read it");
    expect(read(client.queue).items.map((item) => item.id)).toEqual(["newer"]);

    await client.drain();
    expect(read(client.queue).items.map((item) => item.id)).toEqual(["newer"]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("puts an item back where it was when the pool refuses the archive", async () => {
    const { client } = clientOver((request) =>
      routeOf(request) === "GET /v1/queue"
        ? queued(anItem("one"), anItem("two"), anItem("three"))
        : refusal(404, "no-such-item"),
    );

    await client.loadQueue();
    await client.archive("two");
    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "one",
      "three",
    ]);

    await client.drain();
    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(read(client.outbox)[0]?.failure).toBe("that item is not here");
  });

  it("carries a new capture to the far end, where fresh work accumulates", async () => {
    const { client } = clientOver(async (request) =>
      routeOf(request) === "GET /v1/queue"
        ? queued(anItem("old", { createdAt: "2020-01-01T00:00:00.000Z" }))
        : captured(anItem(((await request.json()) as { id: string }).id)),
    );

    await client.loadQueue();
    const fresh = await client.capture({ channel: "web", text: "new" });

    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "old",
      fresh.id,
    ]);
  });
});

describe("draining", () => {
  it("keeps operations against one item in order", async () => {
    const order: string[] = [];
    const { client } = clientOver(async (request) => {
      const route = routeOf(request);
      order.push(route);

      if (route === "POST /v1/captures") {
        const body = (await request.json()) as { id: string };
        await new Promise((resolve) => setTimeout(resolve, 10));
        return captured(anItem(body.id));
      }
      return json(200, { ...anItem("x"), archived: { archivedAt: "now" } });
    });

    const item = await client.capture({ channel: "web", text: "first" });
    await client.archive(item.id);
    await client.drain();

    expect(order).toEqual([
      "POST /v1/captures",
      "POST /v1/items/{id}/archive".replace("{id}", item.id),
    ]);
  });
});

describe("routing", () => {
  it("reaches the pool directly, and fails rather than queuing when it cannot", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { id: "record-1", item: "one", state: "pending", at: "now" }),
    );

    await expect(client.routing.markProcessed("one")).resolves.toMatchObject({
      id: "record-1",
    });

    transport.unreachable(true);
    await expect(client.routing.markProcessed("one")).rejects.toBeInstanceOf(
      Unreachable,
    );
    expect(read(client.outbox)).toEqual([]);
  });

  it("surfaces a destination's refusal as itself", async () => {
    const { client } = clientOver(() => refusal(422, "unknown-destination"));

    await expect(
      client.routing.route("one", {
        destination: "nowhere",
        capability: "create-file",
        target: {},
      }),
    ).rejects.toBeInstanceOf(Refused);
  });
});

describe("reading a surface", () => {
  it("follows the position the last page handed back, and stops when exhausted", async () => {
    const seen: (string | null)[] = [];
    const { client } = clientOver((request) => {
      const after = new URL(request.url).searchParams.get("after");
      seen.push(after);

      return after === null
        ? json(200, {
            values: [anItem("one")],
            next: "/v1/feed?after=one&order=newest-first",
          })
        : json(200, { values: [anItem("two")] });
    });

    await client.loadFeed();
    expect(read(client.feed).more).toBe(true);

    await client.loadFeed();
    await client.loadFeed();

    expect(seen).toEqual([null, "one"]);
    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      "one",
      "two",
    ]);
    expect(read(client.feed).more).toBe(false);
  });

  it("says what went wrong rather than throwing at the shell", async () => {
    const { client } = clientOver(() => refusal(422, "bad-limit"));

    await client.loadFeed();

    const state: ListState = read(client.feed);
    expect(state.failure).toBe("refused: bad-limit");
    expect(state.loading).toBe(false);
  });
});

describe("the store", () => {
  it("mirrors the cache and the outbox into it as they change", async () => {
    const { client, store, transport } = clientOver(() => json(201, {}));
    transport.unreachable(true);

    const optimistic = await client.capture({ channel: "web", text: "held" });
    await client.drain();

    const held: readonly PendingOperation[] = await store.readOutbox();
    expect(held).toHaveLength(1);
    expect(held[0]?.operation.kind).toBe("capture");
    expect((await store.readItems()).map((item) => item.id)).toEqual([
      optimistic.id,
    ]);
  });
});
