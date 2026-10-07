import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import { createClient } from "./client";
import { Refused } from "./errors";
import type { ClientStore } from "./ports/store";
import { read, until } from "./testing/observing";
import { anItem, asked, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";
import type { Item } from "#api/types";
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

/** A file the platform hands over and then cannot read — one that moved, or went. */
const unreadable = () =>
  Object.assign(file(), {
    arrayBuffer: () => Promise.reject(new Error("that file is not there")),
  }) as File;

const WEB = "web";

/** A pool that remembers what it was given, so a replay can be told from a second upload. */
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

    const body = (await request.json()) as {
      id: string;
      payload: Item["payload"];
    };
    captures.push(body.id);
    // The payload back as it was sent, with the assets it names resolved: what
    // an attachment is, is the pool's answer and not the envelope's.
    return json(201, {
      kind: "captured",
      item: anItem(body.id, {
        payload: body.payload,
        ...(body.payload.assets.length === 0
          ? {}
          : {
              assets: body.payload.assets.map((reference) => ({
                id: reference.asset,
                filename: "a photo.png",
                mime: "image/png",
                blob: "sha-256:whatever",
                bytes: 3,
              })),
            }),
      }),
      matchedOn: "id",
    });
  };

  return { assets, captures, handler };
}

function aPicture(asset: string) {
  return anItem("one", {
    payload: {
      type: "note",
      content: {},
      metadata: {},
      assets: [{ slot: "image", asset }],
    },
    assets: [
      {
        id: asset,
        filename: "a photo.png",
        mime: "image/png",
        blob: "sha-256:whatever",
        bytes: 3,
      },
    ],
  });
}

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("an attachment captured with the pool out of reach", () => {
  it("goes up under the id the capture already named, and before it", async () => {
    const pool = aPool();
    const { client, transport } = clientOver(createMemoryStore(), pool.handler);

    const asset = await client.attach(file());
    const item = await client.capture({
      channel: WEB,
      text: "a whiteboard",
      assets: [asset],
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
    const item = await client.capture({
      channel: WEB,
      text: "",
      assets: [asset],
    });
    await client.drain();

    expect(client.attachments(item)[0]?.url).toMatch(/^blob:/);
    expect(client.assetContent(asset)).toMatch(/^blob:/);
    expect(await store.readBlob(asset)).toBeDefined();

    transport.unreachable(false);
    await client.drain();

    // The pool's own answer, which is what says what the attachment is once
    // the bytes this client held have gone.
    const landed = read(client.held(item.id));
    if (landed === undefined) throw new Error("the item went");
    expect(client.attachments(landed)).toEqual([
      {
        asset,
        url: transport.assetUrl(asset),
        filename: "a photo.png",
        mime: "image/png",
        bytes: 3,
      },
    ]);
    expect(await store.readBlob(asset)).toBeUndefined();
  });

  it("is still drawn from the store after the client is built again", async () => {
    const store = createMemoryStore();
    const pool = aPool();

    const first = clientOver(store, pool.handler);
    first.transport.unreachable(true);
    const asset = await first.client.attach(file());
    await first.client.capture({ channel: WEB, text: "", assets: [asset] });
    await first.client.drain();
    first.client.close();

    const second = clientOver(store, pool.handler);
    second.transport.unreachable(true);
    await until(() => read(second.client.queue).items.length > 0);

    const drawn = read(second.client.queue).items[0]!;
    expect(second.client.attachments(drawn)[0]).toMatchObject({
      url: expect.stringMatching(/^blob:/) as unknown,
      filename: "a photo.png",
      mime: "image/png",
      bytes: 3,
    });

    second.transport.unreachable(false);
    await second.client.drain();

    expect(pool.assets).toEqual([asset]);
    expect(pool.captures).toEqual([drawn.id]);
  });

  it("leaves one asset and one item when the capture fails after the upload", async () => {
    const pool = aPool();
    let lost = true;

    const { client, transport } = clientOver(createMemoryStore(), (request) => {
      if (request.method === "POST" && lost)
        throw new TypeError("fetch failed");
      return pool.handler(request);
    });

    const asset = await client.attach(file());
    await client.capture({ channel: WEB, text: "", assets: [asset] });
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
    await client.capture({ channel: WEB, text: "", assets: [asset] });
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

describe("bytes the store cannot answer for", () => {
  it("leave the capture to try again, a store that failed being no refusal", async () => {
    const store = createMemoryStore();
    const { client } = clientOver(
      {
        ...store,
        readBlob: () => Promise.reject(new Error("the database is gone")),
      },
      aPool().handler,
    );

    const asset = await client.attach(file());
    await client.capture({ channel: WEB, text: "", assets: [asset] });
    await until(() => read(client.outbox)[0]?.state === "unreachable");

    expect(read(client.outbox)[0]?.state).toBe("unreachable");
  });

  it("refuse the capture rather than retrying bytes that will never read", async () => {
    const store = createMemoryStore();
    await store.writeBlob("asset-1", unreadable());

    const { client } = clientOver(store, aPool().handler);
    await client.capture({ channel: WEB, text: "", assets: ["asset-1"] });
    await client.drain();

    expect(read(client.outbox)[0]?.state).toBe("refused");
    expect(read(client.outbox)[0]?.failure).toContain("asset-1");
  });

  it("are refused at the moment they are attached, where a person is looking", async () => {
    const { client } = clientOver(createMemoryStore(), aPool().handler);

    await expect(client.attach(unreadable())).rejects.toThrow();
  });
});

describe("a store that cannot forget the bytes", () => {
  it("still lets the capture land, and says what did not happen", async () => {
    const store = createMemoryStore();
    const reported: unknown[] = [];
    const pool = aPool();
    const transport = mockTransport(pool.handler);
    const client = createClient({
      transport,
      store: {
        ...store,
        removeBlob: () => Promise.reject(new Error("quota")),
      },
      now: clock.now,
      onError: (error) => reported.push(error),
    });
    built.push(client);

    const asset = await client.attach(file());
    await client.capture({ channel: WEB, text: "", assets: [asset] });
    await client.drain();

    expect(read(client.outbox)).toEqual([]);
    expect(pool.captures).toHaveLength(1);
    expect(reported).toHaveLength(1);
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

    // Nothing else was waiting to name them, so they went with the edit.
    expect(await store.readBlob("asset-1")).toBeUndefined();
  });
});

describe("a file larger than the pool takes", () => {
  /** A pool that takes uploads of at most `max` bytes, and asks for no credentials. */
  function aLimitedPool(max: number) {
    const pool = aPool();
    const handler: Handler = (request) => {
      const route = routeOf(request);
      if (route === "GET /v1/session") {
        return json(200, { authenticated: false, requiresCredentials: false });
      }
      if (route === "GET /v1/assets/limits") {
        return json(200, { maxUpload: max });
      }
      return pool.handler(request);
    };
    return { ...pool, handler };
  }

  async function limitKnown(transport: { readonly sent: readonly Request[] }) {
    await until(() =>
      transport.sent.some(
        (request) => routeOf(request) === "GET /v1/assets/limits",
      ),
    );
    await new Promise((settle) => setTimeout(settle, 0));
  }

  it("is refused at attach, in the pool's own words, and nothing is held", async () => {
    const store = createMemoryStore();
    const written: string[] = [];
    const watched: ClientStore = {
      ...store,
      writeBlob: (asset, blob) => {
        written.push(asset);
        return store.writeBlob(asset, blob);
      },
    };
    const pool = aLimitedPool(2);
    const { client, transport } = clientOver(watched, pool.handler);
    await client.askSession();
    await limitKnown(transport);

    const attaching = client.attach(file());

    expect(client.refuses(file())).toMatchObject({ code: "asset-too-large" });
    await expect(attaching).rejects.toBeInstanceOf(Refused);
    await expect(attaching).rejects.toMatchObject({ code: "asset-too-large" });
    expect(written).toEqual([]);
  });

  it("is attached where it fits", async () => {
    const pool = aLimitedPool(3);
    const { client, transport } = clientOver(createMemoryStore(), pool.handler);
    await client.askSession();
    await limitKnown(transport);

    expect(client.refuses(file())).toBeUndefined();
    await expect(client.attach(file())).resolves.toEqual(expect.any(String));
  });

  it("is attached while nobody has said what the limit is, and left to the drain", async () => {
    const pool = aLimitedPool(2);
    const { client, transport } = clientOver(createMemoryStore(), pool.handler);

    await expect(client.attach(file())).resolves.toEqual(expect.any(String));
    expect(
      transport.sent.some(
        (request) => routeOf(request) === "GET /v1/assets/limits",
      ),
    ).toBe(false);
  });
});
