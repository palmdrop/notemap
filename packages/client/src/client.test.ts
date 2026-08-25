import { beforeEach, describe, expect, it } from "vitest";

import type { Item } from "./api/types";
import { createMemoryStore } from "./adapters/memory-store";
import { createClient } from "./client";
import { Refused, Unreachable } from "./errors";
import type { PendingOperation } from "./outbox/operations";
import { read } from "./testing/observing";
import { anItem, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";
import type { ListState } from "./types";

const clock = stoppedClock();

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const store = createMemoryStore();
  const client = createClient({
    transport,
    store,
    now: clock.now,
  });
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

  it("takes an item out of the list once the pool records a decision", async () => {
    const { client } = clientOver((request) =>
      routeOf(request) === "GET /v1/queue"
        ? queued(anItem("one"), anItem("two"))
        : json(200, {
            id: "record-1",
            item: "one",
            target: { kind: "user" },
            state: "delivered",
            at: "now",
          }),
    );

    await client.loadQueue();
    await client.routing.markProcessed("one");

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["two"]);
    // Out of the queue, not out of the pool: the feed reads everything.
    expect(await client.item("one")).toBeDefined();
  });

  /** The row stays in the feed, and is what a reader sees the decision on. */
  it("folds the decision into what the held item says about its routing", async () => {
    const { client } = clientOver((request) => {
      const route = routeOf(request);
      if (route === "GET /v1/queue" || route === "GET /v1/feed") {
        return queued(anItem("one"));
      }
      return json(200, {
        id: "record-1",
        item: "one",
        target: { kind: "destination", destination: "vault" },
        state: "pending",
        at: "now",
      });
    });

    await client.loadFeed();
    await client.loadQueue();
    await client.routing.route("one", {
      destination: "vault",
      capability: "create-file",
      target: {},
    });

    expect(read(client.queue).items).toEqual([]);
    expect(read(client.feed).items[0]?.routing).toEqual({
      records: 1,
      pending: 1,
      to: [{ kind: "destination", destination: "vault" }],
    });
  });

  it("leaves a capture beyond the loaded window for a later page to carry", async () => {
    const { client } = clientOver(async (request) => {
      if (routeOf(request) !== "GET /v1/queue") {
        return captured(anItem(((await request.json()) as { id: string }).id));
      }

      return new URL(request.url).searchParams.get("after") === null
        ? json(200, {
            values: [anItem("old", { createdAt: "2020-01-01T00:00:00.000Z" })],
            next: "/v1/queue?after=2020-01-01T00:00:00.000Z,old&order=oldest-first",
          })
        : json(200, {
            values: [anItem("less-old", { createdAt: "2021-01-01T00:00:00Z" })],
          });
    });

    await client.loadQueue();
    const fresh = await client.capture({ channel: "web", text: "new" });

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["old"]);

    await client.loadQueue();
    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "old",
      "less-old",
    ]);
    // The pool has not answered for the feed, so it is the cache newest-first —
    // which is everything the queue's own reads put there.
    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      fresh.id,
      "less-old",
      "old",
    ]);
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
      json(200, {
        id: "record-1",
        item: "one",
        target: { kind: "user" },
        state: "pending",
        at: "now",
      }),
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

  const record = (id: string) => ({
    id,
    item: "one",
    target: { kind: "user" },
    state: "pending",
    at: "now",
  });

  it("reads an item's routing records", async () => {
    const { client } = clientOver(() =>
      json(200, { values: [record("record-1")] }),
    );

    await expect(client.routing.recordsFor("one")).resolves.toHaveLength(1);
  });

  const aRecord = (id: string) => json(200, record(id));

  /** A pool holding `held` records for `one`, and a queue of it alone. */
  function poolHolding(held: () => readonly string[]) {
    return clientOver((request) => {
      const route = routeOf(request);
      if (route === "GET /v1/queue") {
        return json(200, { values: [anItem("one")] });
      }
      if (route === "GET /v1/items/one/routing") {
        return json(200, { values: held().map(record) });
      }
      if (route === "POST /v1/routing/record-1/cancel") {
        return new Response(null, { status: 204 });
      }
      return aRecord("record-1");
    });
  }

  it("makes the item work again when its only decision is withdrawn", async () => {
    let records = ["record-1"];
    const { client, transport } = poolHolding(() => records);

    await client.loadQueue();
    await client.routing.markProcessed("one");
    expect(read(client.queue).items).toEqual([]);

    // The pool deletes a cancelled record rather than marking it.
    records = [];
    await client.routing.cancel("record-1", "one");

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["one"]);
    expect(transport.sent.map(routeOf)).toContain(
      "POST /v1/routing/record-1/cancel",
    );
  });

  it("leaves it out of the queue while it still holds another decision", async () => {
    const { client } = poolHolding(() => ["record-2"]);

    await client.loadQueue();
    await client.routing.markProcessed("one");
    await client.routing.cancel("record-1", "one");

    expect(read(client.queue).items).toEqual([]);
  });

  it("refuses to withdraw one already in flight", async () => {
    const { client } = clientOver(() => refusal(409, "delivery-in-flight"));

    await expect(client.routing.cancel("record-1", "one")).rejects.toThrow(
      "that delivery has already started; it cannot be called back",
    );
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
    expect(state.failure).toBe(
      "the app asked for a page size this daemon will not serve",
    );
    expect(state.loading).toBe(false);
  });

  it("falls back to naming a code the document does not declare", async () => {
    const { client } = clientOver(() => refusal(422, "invented-by-a-proxy"));

    await client.loadFeed();

    expect(read(client.feed).failure).toBe("refused: invented-by-a-proxy");
  });

  it("starts each surface from the end its default names", async () => {
    const asked: (string | null)[] = [];
    const { client } = clientOver((request) => {
      asked.push(new URL(request.url).searchParams.get("order"));
      return json(200, { values: [] });
    });

    await client.loadQueue();
    await client.loadFeed();

    expect(asked).toEqual(["oldest-first", "newest-first"]);
    expect(read(client.queue).order).toBe("oldest-first");
    expect(read(client.feed).order).toBe("newest-first");
  });

  it("turns a surface around and reads it again from the start", async () => {
    const asked: string[] = [];
    const { client } = clientOver((request) => {
      const query = new URL(request.url).searchParams;
      asked.push(`${query.get("order")}/${query.get("after") ?? "-"}`);

      return query.get("order") === "oldest-first"
        ? json(200, {
            values: [anItem("oldest")],
            next: "/v1/queue?after=oldest&order=oldest-first",
          })
        : json(200, { values: [anItem("newest")] });
    });

    await client.loadQueue();
    expect(read(client.queue).items.map((item) => item.id)).toEqual(["oldest"]);

    await client.loadQueue("newest-first");

    expect(asked).toEqual(["oldest-first/-", "newest-first/-"]);
    expect(read(client.queue).items.map((item) => item.id)).toEqual(["newest"]);
    expect(read(client.queue).order).toBe("newest-first");
  });

  it("refuses to turn around while a read is in flight, rather than stitching the two", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { client } = clientOver(async (request) => {
      const query = new URL(request.url).searchParams;
      if (query.get("order") === "oldest-first") {
        await held;
        return json(200, {
          values: [anItem("oldest")],
          next: "/v1/queue?after=oldest&order=oldest-first",
        });
      }
      return json(200, { values: [anItem("newest")] });
    });

    const walking = client.loadQueue();
    await client.loadQueue("newest-first");
    release();
    await walking;

    expect(read(client.queue).order).toBe("oldest-first");
    expect(read(client.queue).items.map((item) => item.id)).toEqual(["oldest"]);
  });

  it("turns an exhausted surface around, which is the whole point of the control", async () => {
    const { client } = clientOver((request) =>
      new URL(request.url).searchParams.get("order") === "oldest-first"
        ? json(200, { values: [anItem("oldest")] })
        : json(200, { values: [anItem("newest")] }),
    );

    await client.loadQueue();
    expect(read(client.queue).more).toBe(false);

    await client.loadQueue("newest-first");

    expect(read(client.queue).items.map((item) => item.id)).toEqual(["newest"]);
    expect(read(client.queue).order).toBe("newest-first");
  });

  it("goes on paging when the order it is given is the one it is already in", async () => {
    const asked: (string | null)[] = [];
    const { client } = clientOver((request) => {
      const after = new URL(request.url).searchParams.get("after");
      asked.push(after);

      return after === null
        ? json(200, {
            values: [anItem("one")],
            next: "/v1/queue?after=one&order=oldest-first",
          })
        : json(200, { values: [anItem("two")] });
    });

    await client.loadQueue("oldest-first");
    await client.loadQueue("oldest-first");

    expect(asked).toEqual([null, "one"]);
    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("places a returned item by rank in whichever order the queue is being read", async () => {
    const { client } = clientOver(async (request) =>
      routeOf(request) === "GET /v1/queue"
        ? json(200, {
            values: [
              anItem("newer", { createdAt: "2022-01-01T00:00:00.000Z" }),
              anItem("older", { createdAt: "2020-01-01T00:00:00.000Z" }),
            ],
          })
        : captured(anItem(((await request.json()) as { id: string }).id)),
    );

    await client.loadQueue("newest-first");
    const fresh = await client.capture({ channel: "web", text: "new" });

    expect(read(client.queue).items.map((item) => item.id)).toEqual([
      fresh.id,
      "newer",
      "older",
    ]);
  });
});

describe("a pool that did not decide", () => {
  it("keeps a 5xx out of the refusal grammar and drains again", async () => {
    let broken = true;
    const { client } = clientOver(async (request) => {
      if (broken) return json(500, { error: { code: "internal" } });

      const body = (await request.json()) as { id: string };
      return captured(anItem(body.id));
    });

    const optimistic = await client.capture({ channel: "web", text: "held" });
    await client.drain();

    expect(read(client.outbox)[0]?.state).toBe("unreachable");
    expect(read(client.outbox)[0]?.failure).toBe(
      "the daemon is having trouble; this will be tried again",
    );
    expect(read(client.feed).items.map((item) => item.id)).toEqual([
      optimistic.id,
    ]);

    broken = false;
    await client.drain();
    expect(read(client.outbox)).toEqual([]);
  });

  it("still rolls back a 4xx, which is the pool saying no", async () => {
    const { client } = clientOver(() => refusal(409, "capture-id-conflict"));

    await client.capture({ channel: "web", text: "conflicting" });
    await client.drain();

    expect(read(client.feed).items).toEqual([]);
    expect(read(client.outbox)[0]?.state).toBe("refused");
  });
});

describe("an asset", () => {
  const file = () =>
    new File([new Uint8Array([1, 2, 3])], "a photo.png", { type: "image/png" });

  it("goes up as raw bytes, under an id the client minted, naming its file", async () => {
    const { client, transport } = clientOver(() =>
      json(201, { id: "asset-1", mediaType: "image/png", bytes: 3 }),
    );

    await expect(client.uploadAsset(file())).resolves.toMatchObject({
      id: "asset-1",
    });

    const sent = transport.sent[0]!;
    expect(routeOf(sent)).toMatch(
      /^PUT \/v1\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(sent.headers.get("content-type")).toBe("image/png");
    expect(sent.headers.get("content-disposition")).toContain("a%20photo.png");
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("takes a 200 as the asset the pool already held, not as an empty answer", async () => {
    const { client } = clientOver(() =>
      json(200, { id: "asset-1", mediaType: "image/png", bytes: 3 }),
    );

    await expect(client.uploadAsset(file())).resolves.toMatchObject({
      id: "asset-1",
    });
  });

  it("mints a fresh id per upload, so two files are two assets", async () => {
    const { client, transport } = clientOver(() =>
      json(201, { id: "asset-1", mediaType: "image/png", bytes: 3 }),
    );

    await client.uploadAsset(file());
    await client.uploadAsset(file());

    const [first, second] = transport.sent.map(routeOf);
    expect(first).not.toBe(second);
  });

  it("surfaces a refusal rather than handing back a body that is not an asset", async () => {
    const { client } = clientOver(() => refusal(413, "asset-too-large"));

    await expect(client.uploadAsset(file())).rejects.toBeInstanceOf(Refused);
  });

  it("asks the transport where its bytes are, rather than building a URL", () => {
    const transport = mockTransport(() => json(200, {}));
    const client = createClient({
      transport,
      store: createMemoryStore(),
    });
    const item = {
      ...anItem("one"),
      payload: {
        type: "image",
        content: {},
        metadata: {},
        assets: [{ slot: "image", asset: "an asset/1" }],
      },
    };

    expect(client.images(item)).toEqual([transport.assetUrl("an asset/1")]);
    expect(client.assetContent("an asset/1")).toContain("an%20asset%2F1");
  });

  it("reads what an item says, whichever slot holds it", () => {
    const { client } = clientOver(() => json(200, {}));

    expect(client.says(anItem("one"))).toBe("one");
    expect(
      client.says({
        ...anItem("two"),
        payload: {
          type: "image",
          content: { caption: "a caption" },
          metadata: {},
          assets: [],
        },
      }),
    ).toBe("a caption");
    expect(
      client.says({
        ...anItem("three"),
        payload: { type: "voice", content: {}, metadata: {}, assets: [] },
      }),
    ).toBe("");
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
