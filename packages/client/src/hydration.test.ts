import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import { saidBy } from "./errors";
import type { Item } from "./api/types";
import { createClient } from "./client";
import type { PendingOperation } from "./outbox/operations";
import type { ClientStore } from "./ports/store";
import type { Client } from "./types";
import { read, until } from "./testing/observing";
import { anItem, asked, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";

const clock = stoppedClock();

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

function clientOver(store: ClientStore, handler: Handler) {
  const transport = mockTransport(handler);
  const reported: unknown[] = [];
  const client = createClient({
    transport,
    store,
    now: clock.now,
    onError: (error) => reported.push(error),
  });
  built.push(client);
  return { client, transport, reported };
}

const unreachable = () => json(200, {});

function anOperation(
  id: string,
  operation: PendingOperation["operation"],
  state: PendingOperation["state"] = "pending",
): PendingOperation {
  return { id, operation, at: "2026-08-17T11:00:00.000Z", state };
}

function archived(item: Item): Item {
  return { ...item, archived: { archivedAt: "2026-08-17T11:00:00.000Z" } };
}

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("hydration", () => {
  it("comes up holding the outbox and the items the store was left with", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    await store.writeOperation(
      anOperation("op-1", { kind: "unarchive", item: "one" }),
    );

    const { client, transport } = clientOver(store, unreachable);
    transport.unreachable(true);
    await until(() => read(client.outbox).length > 0);

    expect(read(client.outbox)[0]?.id).toBe("op-1");

    // The item is in the cache, which is why archiving it changes anything.
    await client.archive("one");
    expect((await store.readItems())[0]?.archived).toBeDefined();
  });

  it("completes a tag it saw last session with no transport to ask", async () => {
    const store = createMemoryStore();
    await store.writeTags([{ name: "reading", items: 3 }]);

    const { client, transport } = clientOver(store, unreachable);
    transport.unreachable(true);
    await until(() => read(client.tags.inUse).length > 0);

    expect(read(client.tags.inUse).map((use) => use.name)).toEqual(["reading"]);
    expect(asked(transport)).toEqual([]);
  });

  it("drains a capture made in a previous session, exactly once, unprompted", async () => {
    const store = createMemoryStore();

    const first = clientOver(store, unreachable);
    first.transport.unreachable(true);
    const optimistic = await first.client.capture({
      channel: "web",
      text: "written with the pool down",
    });
    await first.client.drain();

    expect(read(first.client.outbox)).toHaveLength(1);

    const captures: string[] = [];
    const { client, transport } = clientOver(store, async (request) => {
      const body = (await request.json()) as { id: string };
      captures.push(body.id);
      return json(201, { kind: "captured", item: anItem(body.id) });
    });

    await until(() => captures.length > 0);

    expect(captures).toEqual([optimistic.id]);
    expect(read(client.outbox)).toEqual([]);
    expect(asked(transport).map(routeOf)).toEqual(["POST /v1/captures"]);
  });

  it("settles a rehydrated operation the pool refuses from the pool itself", async () => {
    const store = createMemoryStore();
    await store.writeItems([archived(anItem("one"))]);
    await store.writeOperation(
      anOperation("op-1", { kind: "archive", item: "one" }),
    );

    const { client } = clientOver(store, (request) =>
      routeOf(request) === "GET /v1/items/one"
        ? json(200, anItem("one"))
        : refusal(409, "already-processed"),
    );

    await until(() => read(client.outbox)[0]?.state === "refused");

    expect(read(client.outbox)[0]?.failure).toBeDefined();
    // Nothing rolled it back — the pool was asked what the item is now.
    expect((await store.readItems())[0]?.archived).toBeUndefined();
  });

  it("forgets an item whose rehydrated capture the pool refuses", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("two")]);
    await store.writeOperation(
      anOperation("op-1", {
        kind: "capture",
        envelope: {
          id: "two",
          source: "web",
          sourceItemId: "two",
          capturedAt: "2026-08-17T11:00:00.000Z",
          payload: { type: "text", content: {}, metadata: {}, assets: [] },
        },
      }),
    );

    const { client } = clientOver(store, (request) =>
      routeOf(request) === "GET /v1/items/two"
        ? refusal(404, "no-such-item")
        : refusal(422, "unsupported-payload"),
    );

    await until(() => read(client.outbox)[0]?.state === "refused");

    expect(await store.readItems()).toEqual([]);
  });

  it("sends an operation the last session was interrupted mid-send, exactly once", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    // What the store holds when the tab is closed while the request is away.
    await store.writeOperation(
      anOperation("op-1", { kind: "archive", item: "one" }, "sending"),
    );

    const sent: string[] = [];
    const { client } = clientOver(store, (request) => {
      sent.push(routeOf(request));
      return json(200, anItem("one"));
    });

    await until(() => sent.length > 0);

    expect(sent).toEqual(["POST /v1/items/one/archive"]);
    expect(read(client.outbox)).toEqual([]);
    expect(await store.readOutbox()).toEqual([]);
  });

  it("reports a store it cannot read, and keeps the collections it could", async () => {
    const store = createMemoryStore();
    await store.writeTags([{ name: "reading", items: 3 }]);
    const broken: ClientStore = {
      ...store,
      readItems: () => Promise.reject(new Error("the database is gone")),
    };

    const { client, reported } = clientOver(broken, unreachable);
    await until(() => reported.length > 0);

    expect(saidBy(reported[0])).toContain("items");
    // The read that failed is the only one lost.
    expect(read(client.tags.inUse).map((use) => use.name)).toEqual(["reading"]);
  });

  it("leaves a rehydrated refusal alone: it is not re-sent and it waits for a person", async () => {
    const store = createMemoryStore();
    await store.writeItems([anItem("one")]);
    await store.writeOperation(
      anOperation("op-1", { kind: "archive", item: "one" }, "refused"),
    );

    const { client, transport } = clientOver(store, unreachable);
    await client.drain();

    expect(asked(transport)).toEqual([]);
    expect(read(client.outbox)[0]?.state).toBe("refused");
  });
});
