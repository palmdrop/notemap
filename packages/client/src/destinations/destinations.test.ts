import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { Destination } from "#api/types";
import { createClient } from "../client";
import { Refused, Unreachable } from "../errors";
import type { ClientStore } from "#ports/store";
import { read } from "#testing/observing";
import { asked as sentTo, routeOf } from "#testing/pool";
import { json, mockTransport, refusal, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({
    transport,
    store: createMemoryStore(),
  });
  return { client, transport };
}

/** Wraps a store to record every write it was asked to make, none of them undone. */
function spyingOn(store: ClientStore): {
  store: ClientStore;
  writes: string[];
} {
  const writes: string[] = [];
  return {
    writes,
    store: new Proxy(store, {
      get(target, property, receiver) {
        if (typeof property === "string" && property.startsWith("write")) {
          writes.push(property);
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
}

function aDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
    name: "Vault",
    kind: "filesystem",
    settings: { root: "~/notes" },
    retired: false,
    ...overrides,
  };
}

const asked = (transport: { sent: readonly Request[] }) =>
  sentTo(transport).map(routeOf);

describe("reading destinations", () => {
  it("fills the cache a screen renders from", async () => {
    const vault = aDestination();
    const { client } = clientOver(() => json(200, { values: [vault] }));

    expect(read(client.destinations.all)).toEqual([]);
    expect(await client.destinations.load()).toEqual([vault]);
    expect(read(client.destinations.all)).toEqual([vault]);
  });

  /**
   * The list is pool state and the description is I/O against the outside
   * world, so reading the list must not cost a probe of every destination.
   */
  it("asks nothing about what a destination can do until it is asked", async () => {
    const { client, transport } = clientOver((request) =>
      request.url.endsWith("/description")
        ? json(200, { kind: "described", capabilities: [] })
        : json(200, { values: [aDestination()] }),
    );

    await client.destinations.load();
    expect(asked(transport)).toEqual(["GET /v1/destinations"]);

    await client.destinations.describe(aDestination().id);
    expect(asked(transport)).toEqual([
      "GET /v1/destinations",
      `GET /v1/destinations/${aDestination().id}/description`,
    ]);
  });

  it("reads an unusable one as an answer rather than as a failure", async () => {
    const { client } = clientOver(() =>
      json(200, {
        kind: "unusable",
        detail: "nothing here speaks the kanban kind",
      }),
    );

    expect(await client.destinations.describe(aDestination().id)).toEqual({
      kind: "unusable",
      detail: "nothing here speaks the kanban kind",
    });
  });

  it("keeps showing what it last saw once the pool goes away", async () => {
    const { client, transport } = clientOver(() =>
      json(200, { values: [aDestination()] }),
    );
    await client.destinations.load();

    transport.unreachable(true);
    await expect(client.destinations.load()).rejects.toBeInstanceOf(
      Unreachable,
    );

    expect(read(client.destinations.all)).toEqual([aDestination()]);
  });
});

describe("editing a destination", () => {
  it("puts what the pool answered into the cache", async () => {
    const renamed = aDestination({ name: "Second brain" });
    const { client } = clientOver((request) =>
      request.method === "PATCH"
        ? json(200, renamed)
        : json(200, { values: [aDestination()] }),
    );
    await client.destinations.load();

    expect(
      await client.destinations.update(renamed.id, { name: "Second brain" }),
    ).toEqual(renamed);
    expect(read(client.destinations.all)).toEqual([renamed]);
  });

  it("appends one it created rather than waiting for a second read", async () => {
    const { client } = clientOver(() => json(201, aDestination()));

    await client.destinations.create({
      name: "Vault",
      kind: "filesystem",
      settings: { root: "~/notes" },
    });

    expect(read(client.destinations.all)).toEqual([aDestination()]);
  });

  it("drops one it deleted", async () => {
    const { client } = clientOver((request) =>
      request.method === "DELETE"
        ? new Response(null, { status: 204 })
        : json(200, { values: [aDestination()] }),
    );
    await client.destinations.load();

    await client.destinations.delete(aDestination().id);

    expect(read(client.destinations.all)).toEqual([]);
  });

  it("carries retirement back, and keeps the row listed", async () => {
    const retired = aDestination({ retired: true });
    const { client } = clientOver((request) =>
      request.method === "POST"
        ? json(200, retired)
        : json(200, { values: [aDestination()] }),
    );
    await client.destinations.load();

    expect(await client.destinations.retire(retired.id)).toEqual(retired);
    expect(read(client.destinations.all)).toEqual([retired]);
  });

  /**
   * The outbox's second exception. An offline edit would validate against a
   * cached schema and hand back an acceptance the pool may then refuse, so it
   * is refused here instead of promised.
   */
  it("is refused rather than queued while the pool is unreachable", async () => {
    const { client, transport } = clientOver(() => json(201, aDestination()));
    transport.unreachable(true);

    await expect(
      client.destinations.create({
        name: "Vault",
        kind: "filesystem",
        settings: { root: "~/notes" },
      }),
    ).rejects.toBeInstanceOf(Unreachable);

    expect(read(client.outbox)).toEqual([]);
    expect(read(client.destinations.all)).toEqual([]);
  });

  it("says in a sentence why a deletion was refused", async () => {
    const { client } = clientOver(() => refusal(409, "destination-in-use"));

    const refused = await client.destinations
      .delete(aDestination().id)
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Refused);
    expect((refused as Refused).message).toMatch(/retire it instead/);
  });

  it("names the kind it has no adapter for", async () => {
    const { client } = clientOver(() =>
      json(422, {
        error: {
          code: "unknown-destination-kind",
          destinationKind: "kanban",
        },
      }),
    );

    const refused = await client.destinations
      .create({ name: "Board", kind: "kanban", settings: {} })
      .catch((error: unknown) => error);

    expect((refused as Refused).message).toMatch(/"kanban"/);
  });
});

describe("asking what a field could hold", () => {
  it("carries the capability, field and scope as query parameters", async () => {
    const { client, transport } = clientOver(() =>
      json(200, {
        kind: "answered",
        entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
        truncated: false,
      }),
    );

    const answer = await client.destinations.candidates(aDestination().id, {
      capability: "create-file",
      field: "directory",
      scope: "notes",
    });

    expect(answer).toEqual({
      kind: "answered",
      entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
      truncated: false,
    });

    const request = sentTo(transport).at(-1);
    expect(request === undefined ? undefined : routeOf(request)).toBe(
      `GET /v1/destinations/${aDestination().id}/candidates`,
    );
    const query = new URL(request?.url ?? "").searchParams;
    expect(query.get("capability")).toBe("create-file");
    expect(query.get("field")).toBe("directory");
    expect(query.get("scope")).toBe("notes");
  });

  it("reads a refusal the destination itself gave as an answer, not a failure", async () => {
    const { client } = clientOver(() => json(200, { kind: "not-offered" }));

    expect(
      await client.destinations.candidates(aDestination().id, {
        capability: "create-file",
        field: "directory",
      }),
    ).toEqual({ kind: "not-offered" });
  });

  it("says in a sentence why the route refused the field itself", async () => {
    const { client } = clientOver(() =>
      refusal(422, "field-not-askable", {
        capability: "create-file",
        field: "filename",
      }),
    );

    const refused = await client.destinations
      .candidates(aDestination().id, {
        capability: "create-file",
        field: "filename",
      })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Refused);
    expect((refused as Refused).message).toMatch(/type it instead/);
  });

  /**
   * Never durable: a vault's contents are somebody else's state, stale the
   * moment somebody else writes a file. The durable cache is for the pool's
   * own collections, and this answer is not one of them.
   */
  it("writes nothing to the store", async () => {
    const transport = mockTransport(() => json(200, { kind: "not-offered" }));
    const { store, writes } = spyingOn(createMemoryStore());
    const client = createClient({ transport, store });

    await client.destinations.candidates(aDestination().id, {
      capability: "create-file",
      field: "directory",
    });

    expect(writes).not.toContain("writeDestinations");
  });
});
