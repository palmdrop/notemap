import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createFetchTransport } from "../adapters/fetch-transport";
import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { Refused, Unauthenticated, Unreachable } from "../errors";
import { read } from "../testing/observing";
import { mockTransport, json } from "../testing/transport";
import { acknowledged, answered, createApi } from "./http";

const answering = (status: number, body?: unknown) =>
  Promise.resolve({
    ...(body === undefined ? {} : { error: body }),
    ...(status < 400 ? { data: { ok: true } } : {}),
    response: new Response(null, { status }),
  });

const refusal = (code: string) => ({ error: { code } });

describe("what the daemon's answer is read as", () => {
  /**
   * The three are told apart because they mean different things to what is
   * queued: a refusal is final, silence is waited out, and a shut door is
   * waited on by a person signing in.
   */
  it("reads a 401 as a door rather than a refusal", async () => {
    await expect(
      answered(answering(401, refusal("unauthenticated"))),
    ).rejects.toBeInstanceOf(Unauthenticated);
  });

  it("reads a 5xx as the daemon not having answered", async () => {
    await expect(answered(answering(500))).rejects.toBeInstanceOf(Unreachable);
    await expect(answered(answering(503))).rejects.toBeInstanceOf(Unreachable);
  });

  it("reads anything else it refused as a refusal", async () => {
    await expect(
      answered(answering(404, refusal("no-such-item"))),
    ).rejects.toBeInstanceOf(Refused);
    await expect(
      answered(answering(403, refusal("session-required"))),
    ).rejects.toBeInstanceOf(Refused);
    await expect(
      answered(answering(429, refusal("too-many-attempts"))),
    ).rejects.toBeInstanceOf(Refused);
  });

  it("reads a request that never arrived as unreachable", async () => {
    await expect(
      answered(Promise.reject(new Error("socket closed"))),
    ).rejects.toBeInstanceOf(Unreachable);
  });

  it("answers the data where there was any", async () => {
    await expect(answered(answering(200))).resolves.toEqual({ ok: true });
  });
});

describe("an answer with nothing to read back", () => {
  it("tells the same three apart", async () => {
    await expect(
      acknowledged(answering(401, refusal("unauthenticated"))),
    ).rejects.toBeInstanceOf(Unauthenticated);
    await expect(acknowledged(answering(500))).rejects.toBeInstanceOf(
      Unreachable,
    );
    await expect(
      acknowledged(answering(404, refusal("no-such-item"))),
    ).rejects.toBeInstanceOf(Refused);
  });

  it("takes a 204 as done", async () => {
    await expect(acknowledged(answering(204))).resolves.toBeUndefined();
  });
});

/**
 * The daemon refuses a write that declares no media type, bodyless or not, and
 * `openapi-fetch` declares one only where there is a body to serialise.
 */
describe("the media type a write declares", () => {
  const asked = (transport: ReturnType<typeof mockTransport>) =>
    transport.sent[transport.sent.length - 1] as Request;

  it("is set on a write that carries no body", async () => {
    const transport = mockTransport(() => json(200, {}));
    const api = createApi(transport);

    await api.POST("/v1/destinations/{id}/retire", {
      params: { path: { id: "a-destination" } },
    });

    expect(asked(transport).headers.get("content-type")).toBe(
      "application/json",
    );
  });

  it("is left alone where the caller set one", async () => {
    const transport = mockTransport(() => json(200, {}));
    const api = createApi(transport);

    await api.PUT("/v1/assets/{id}", {
      params: {
        path: { id: "an-asset" },
        header: { "content-disposition": 'attachment; filename="a.png"' },
      },
      headers: { "content-type": "image/png" },
      body: null as never,
    });

    expect(asked(transport).headers.get("content-type")).toBe("image/png");
  });

  it("is not added to a read", async () => {
    const transport = mockTransport(() => json(200, { items: [] }));
    const api = createApi(transport);

    await api.GET("/v1/feed", {});

    expect(asked(transport).headers.get("content-type")).toBeNull();
  });
});

let stalling: Server | undefined;

/** Accepts the connection and answers nothing, which no socket times out. */
function accepting(): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(() => undefined);
    stalling = server;
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${String(port)}`);
    });
  });
}

afterEach(() => {
  stalling?.closeAllConnections();
  stalling?.close();
  stalling = undefined;
});

describe("a client that has been closed", () => {
  /**
   * The signal a close fires does not un-fire, so everything after it is
   * abandoned the moment it is made. A shell that builds one client and closes
   * it on a view that unmounts and mounts again is left holding a dead one,
   * which looks exactly like a pool that cannot be reached.
   */
  async function capturing(closed: boolean): Promise<number> {
    const client = createClient({
      transport: mockTransport(() => json(200, { ok: true })),
      store: createMemoryStore(),
    });

    if (closed) client.close();
    await client.capture({ channel: "web", text: "after a close" });
    await client.drain();

    return read(client.waiting);
  }

  it("sends nothing further, and what it is given waits in the outbox", async () => {
    expect(await capturing(true)).toBe(1);
  });

  it("is told apart from a client that was left open, which sends", async () => {
    expect(await capturing(false)).toBe(0);
  });
});

describe("a request against a pool that never answers", () => {
  it("is given up on, and what it carried stays in the outbox", async () => {
    const client = createClient({
      transport: createFetchTransport(await accepting()),
      store: createMemoryStore(),
      timeout: 250,
    });
    client.watched(false);

    await client.capture({ channel: "web", text: "sent at nothing" });
    await client.drain();

    expect(read(client.waiting)).toBe(1);
    client.close();
  });

  it("is waited on up to the limit, rather than given up on at the first slowness", async () => {
    const client = createClient({
      transport: createFetchTransport(await accepting()),
      store: createMemoryStore(),
      timeout: 5_000,
    });
    client.watched(false);

    await client.capture({ channel: "web", text: "sent at nothing" });
    const settled = await Promise.race([
      client.drain().then(() => "drained"),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 750)),
    ]);

    expect(settled).toBe("still waiting");
    client.close();
  });
});
