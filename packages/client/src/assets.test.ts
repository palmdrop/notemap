import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import { createClient } from "./client";
import type { ClientStore } from "./ports/store";
import { read, until } from "./testing/observing";
import { anItem, asked, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";
import type { Client } from "./types";

const clock = stoppedClock();

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

const file = () =>
  new File([new Uint8Array([1, 2, 3])], "a photo.png", { type: "image/png" });

const PICTURE = "web-picture";

/** A pool that remembers what it was given, and answers a replay as a replay. */
function aPool() {
  const assets: string[] = [];
  const captures: string[] = [];

  const handler: Handler = async (request) => {
    const route = routeOf(request);

    if (request.method === "PUT") {
      const id = route.slice("PUT /v1/assets/".length);
      const held = assets.includes(id);
      if (!held) assets.push(id);

      return json(held ? 200 : 201, {
        id,
        filename: "a photo.png",
        mime: "image/png",
        blob: "sha-256:whatever",
        bytes: 3,
      });
    }

    const body = (await request.json()) as { id: string };
    captures.push(body.id);
    return json(201, {
      kind: "captured",
      item: anItem(body.id),
      matchedOn: "id",
    });
  };

  return { assets, captures, handler };
}

function aPicture(asset: string) {
  return {
    ...anItem("one"),
    payload: {
      type: "image",
      content: {},
      metadata: {},
      assets: [{ slot: "image", asset }],
    },
  };
}

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("a picture captured with the pool out of reach", () => {
  it("goes up under the id the capture already named, and before it", async () => {
    const pool = aPool();
    const { client, transport } = clientOver(createMemoryStore(), pool.handler);

    const asset = await client.attach(file());
    const item = await client.capture({
      channel: PICTURE,
      text: "a whiteboard",
      asset,
    });
    await client.drain();

    expect(asked(transport).map(routeOf)).toEqual([
      `PUT /v1/assets/${asset}`,
      "POST /v1/captures",
    ]);

    const sent = asked(transport)[0]!;
    expect(sent.headers.get("content-type")).toBe("image/png");
    expect(sent.headers.get("content-disposition")).toContain("a%20photo.png");
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(pool.captures).toEqual([item.id]);
  });

  it("draws its own bytes until it lands, and the pool's after", async () => {
    const store = createMemoryStore();
    const { client, transport } = clientOver(store, aPool().handler);
    transport.unreachable(true);

    const asset = await client.attach(file());
    const item = await client.capture({ channel: PICTURE, text: "", asset });
    await client.drain();

    expect(client.images(item)[0]).toMatch(/^blob:/);
    expect(client.assetContent(asset)).toMatch(/^blob:/);
    expect(await store.readBlob(asset)).toBeDefined();

    transport.unreachable(false);
    await client.drain();

    expect(client.images(item)).toEqual([transport.assetUrl(asset)]);
    expect(await store.readBlob(asset)).toBeUndefined();
  });

  it("is still drawn from the store after the client is built again", async () => {
    const store = createMemoryStore();
    const pool = aPool();

    const first = clientOver(store, pool.handler);
    first.transport.unreachable(true);
    const asset = await first.client.attach(file());
    await first.client.capture({ channel: PICTURE, text: "", asset });
    await first.client.drain();
    first.client.close();

    const second = clientOver(store, pool.handler);
    second.transport.unreachable(true);
    await until(() => read(second.client.queue).items.length > 0);

    const drawn = read(second.client.queue).items[0]!;
    expect(second.client.images(drawn)[0]).toMatch(/^blob:/);

    second.transport.unreachable(false);
    await second.client.drain();

    expect(pool.assets).toEqual([asset]);
    expect(pool.captures).toEqual([drawn.id]);
  });

  it("leaves one asset and one item when the capture fails after the upload", async () => {
    const pool = aPool();
    let lost = true;

    const { client, transport } = clientOver(createMemoryStore(), (request) => {
      if (request.method === "POST" && lost) throw new TypeError("fetch failed");
      return pool.handler(request);
    });

    const asset = await client.attach(file());
    await client.capture({ channel: PICTURE, text: "", asset });
    await until(() => read(client.outbox)[0]?.state === "unreachable");

    expect(pool.assets).toEqual([asset]);
    expect(pool.captures).toEqual([]);

    lost = false;
    await client.drain();

    // The pair went again, and the pool answered the upload with what it held.
    expect(asked(transport).map(routeOf).slice(-2)).toEqual([
      `PUT /v1/assets/${asset}`,
      "POST /v1/captures",
    ]);
    expect(pool.assets).toEqual([asset]);
    expect(pool.captures).toHaveLength(1);
    expect(read(client.outbox)).toEqual([]);
  });

  it("keeps its bytes while a refusal stands, and loses them when it is dismissed", async () => {
    const store = createMemoryStore();
    const pool = aPool();
    const { client } = clientOver(store, (request) =>
      request.method === "POST"
        ? refusal(409, "capture-id-conflict")
        : pool.handler(request),
    );

    const asset = await client.attach(file());
    await client.capture({ channel: PICTURE, text: "", asset });
    await client.drain();

    expect(read(client.outbox)[0]?.state).toBe("refused");
    expect(await store.readBlob(asset)).toBeDefined();

    await client.dismiss(read(client.outbox)[0]!.id);
    expect(await store.readBlob(asset)).toBeUndefined();
  });

  it("is one asset per file attached, as two uploads always were", async () => {
    const store = createMemoryStore();
    const { client } = clientOver(store, aPool().handler);

    const one = await client.attach(file());
    const other = await client.attach(file());

    expect(one).not.toBe(other);
    expect(await store.readBlob(one)).toBeDefined();
    expect(await store.readBlob(other)).toBeDefined();
  });
});

describe("an edit naming bytes the store still holds", () => {
  it("sends them before the revision that names them", async () => {
    const store = createMemoryStore();
    await store.writeBlob("asset-1", file());
    await store.writeItems([aPicture("asset-1")]);

    const pool = aPool();
    const { client, transport } = clientOver(store, (request) =>
      routeOf(request) === "POST /v1/items/one/edit"
        ? json(200, { kind: "amended", item: aPicture("asset-1") })
        : pool.handler(request),
    );

    await until(() => read(client.queue).items.length > 0);
    await client.edit("one", aPicture("asset-1").payload, "web");
    await client.drain();

    expect(asked(transport).map(routeOf)).toEqual([
      "PUT /v1/assets/asset-1",
      "POST /v1/items/one/edit",
    ]);
  });
});
