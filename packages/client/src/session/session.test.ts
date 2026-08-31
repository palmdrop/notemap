import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "../testing/observing";
import { anItem, stoppedClock } from "../testing/pool";
import { json, mockTransport, refusal, type Handler } from "../testing/transport";
import type { Client } from "../types";

const clock = stoppedClock();
const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({
    transport,
    store: createMemoryStore(),
    now: clock.now,
  });
  built.push(client);
  return { client, transport };
}

const said = (
  authenticated: boolean,
  requiresCredentials = true,
  identity?: { kind: string; id: string; name?: string },
) =>
  json(200, {
    authenticated,
    requiresCredentials,
    ...(identity === undefined ? {} : { identity }),
  });

const route = (request: Request) =>
  `${request.method} ${new URL(request.url).pathname}`;

describe("asking who this client is", () => {
  it("knows nothing until it has asked", async () => {
    const { client } = clientOver(() => json(200, {}));

    expect(await read(client.session)).toMatchObject({
      known: false,
      signedIn: false,
    });
  });

  it("reads a daemon that asks for nothing as open rather than as signed out", async () => {
    const { client } = clientOver((request) =>
      route(request) === "GET /v1/session"
        ? said(false, false)
        : json(200, {}),
    );

    expect(await client.askSession()).toMatchObject({
      required: false,
      signedIn: false,
      known: true,
    });
  });

  it("reads a session as signed in, and says what signed it in", async () => {
    const { client } = clientOver((request) =>
      route(request) === "GET /v1/session"
        ? said(true, true, { kind: "session", id: "abc" })
        : json(200, {}),
    );

    expect(await client.askSession()).toMatchObject({
      required: true,
      signedIn: true,
      as: { kind: "session" },
    });
  });
});

describe("signing in", () => {
  it("takes the credential and comes back signed in", async () => {
    const { client, transport } = clientOver((request) =>
      route(request) === "POST /v1/session"
        ? said(true, true, { kind: "session", id: "abc" })
        : json(200, {}),
    );

    await client.login("anton", "correct horse battery staple");

    expect(await read(client.session)).toMatchObject({
      signedIn: true,
      known: true,
    });

    const sent = transport.sent.find(
      (request) => route(request) === "POST /v1/session",
    );
    expect(await sent?.clone().json()).toEqual({
      name: "anton",
      password: "correct horse battery staple",
    });
  });

  it("leaves the client signed out when the credential is wrong", async () => {
    const { client } = clientOver((request) =>
      route(request) === "POST /v1/session"
        ? refusal(401, "unauthenticated")
        : json(200, {}),
    );

    await expect(
      client.login("anton", "not the password"),
    ).rejects.toBeDefined();

    expect(await read(client.session)).toMatchObject({ signedIn: false });
  });
});

describe("signing out", () => {
  /**
   * ADR 23's rule, for the same reason it was written: what is held describes
   * somewhere the holder can no longer speak for. Drawing it because it happens
   * to be local would make signing out mean nothing.
   */
  it("drops what was drawn from the pool", async () => {
    const { client } = clientOver((request) => {
      const asked = route(request);
      if (asked === "GET /v1/queue") {
        return json(200, { values: [anItem("one")] });
      }
      if (asked === "DELETE /v1/session") return new Response(null, { status: 204 });
      return json(200, {});
    });

    await client.loadQueue();
    expect((await read(client.queue)).items).toHaveLength(1);

    await client.logout();

    expect((await read(client.queue)).items).toEqual([]);
    expect(await read(client.session)).toMatchObject({ signedIn: false });
  });

  /** Unsent work is the person's own, not the pool's, and it drains on the way back in. */
  it("keeps the outbox", async () => {
    const { client } = clientOver((request) => {
      const asked = route(request);
      if (asked === "DELETE /v1/session") return new Response(null, { status: 204 });
      if (asked === "POST /v1/items/one/archive") return refusal(503, "down");
      return json(200, {});
    });

    await client.archive("one");
    expect(await read(client.outbox)).toHaveLength(1);

    await client.logout();

    expect(await read(client.outbox)).toHaveLength(1);
  });

  it("forgets even where the daemon would not answer the request", async () => {
    const { client, transport } = clientOver((request) => {
      if (route(request) === "GET /v1/queue") {
        return json(200, { values: [anItem("one")] });
      }
      return json(200, {});
    });

    await client.loadQueue();
    transport.unreachable(true);

    await expect(client.logout()).rejects.toBeDefined();

    expect((await read(client.queue)).items).toEqual([]);
  });
});

describe("a credential that lapsed while nobody was looking", () => {
  /**
   * Nothing announces an expiry, so a 401 arriving from any route is the only
   * notice a client gets. The surface has to hear about it, or it goes on
   * drawing a pool it can no longer read.
   */
  it("is noticed from a 401 on any route, without being asked for", async () => {
    const { client } = clientOver((request) => {
      const asked = route(request);
      if (asked === "GET /v1/session") return said(true, true, { kind: "session", id: "abc" });
      if (asked === "GET /v1/queue") return refusal(401, "unauthenticated");
      return json(200, {});
    });

    await client.askSession();
    expect(await read(client.session)).toMatchObject({ signedIn: true });

    await client.loadQueue().catch(() => undefined);

    expect(await read(client.session)).toMatchObject({
      signedIn: false,
      required: true,
      known: true,
    });
  });
});
