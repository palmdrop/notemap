import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../../adapters/memory-store";
import { createClient } from "../../client";
import type { BatchOutcome, Item, RoutingTemplate } from "#api/types";
import { read } from "#testing/observing";
import { anItem, asked, routeOf } from "#testing/pool";
import { json, mockTransport, refusal, type Handler } from "#testing/transport";
import type { Client } from "../../types";

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

const TEMPLATE: RoutingTemplate = {
  id: "template",
  name: "Research links",
  destination: "vault",
  capability: "create-or-append",
  arguments: { path: "research.md" },
  folder: "create",
  triggerTag: "route/research",
  fired: { records: 0 },
};

const OTHER: RoutingTemplate = {
  ...TEMPLATE,
  id: "other",
  name: "Reading",
  triggerTag: "route/reading",
};

const QUEUED: readonly Item[] = [anItem("one"), anItem("two"), anItem("three")];

type Sent = { batch: string; items: string[]; action: { kind: string } };

/**
 * A pool holding three unprocessed items, which answers a batch with what
 * `answer` says of each item it was sent.
 */
function pool(
  answer: (id: string, sent: Sent) => BatchOutcome,
  sent: Sent[] = [],
): Handler {
  return async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: QUEUED });
    if (route === "GET /v1/templates") {
      return json(200, { values: [OTHER, TEMPLATE] });
    }
    if (route === "POST /v1/batches") {
      const body = (await request.json()) as Sent;
      sent.push(body);
      return json(200, {
        batch: body.batch,
        values: body.items.map((id) => answer(id, body)),
      });
    }
    return json(200, { values: [] });
  };
}

async function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  built.push(client);
  await client.loadQueue();
  return { client, transport };
}

const queued = (client: Client) =>
  read(client.queue).items.map((item) => item.id);

const archivedNow = (id: string): BatchOutcome => ({
  id,
  outcome: "archived",
  item: anItem(id, { archived: { archivedAt: "2026-08-17T11:00:00.000Z" } }),
});

describe("a batch", () => {
  it("is one request carrying every item and the batch's id", async () => {
    const sent: Sent[] = [];
    const { client, transport } = await clientOver(pool(archivedNow, sent));

    const id = await client.batch(["one", "two"], { kind: "archive" });
    await client.drain();

    expect(
      asked(transport)
        .map(routeOf)
        .filter((route) => route === "POST /v1/batches"),
    ).toHaveLength(1);
    expect(sent).toEqual([
      { batch: id, items: ["one", "two"], action: { kind: "archive" } },
    ]);
  });

  it("takes archived rows off the queue before the pool answers", async () => {
    const { client, transport } = await clientOver(pool(archivedNow));
    transport.unreachable(true);

    await client.batch(["one", "two"], { kind: "archive" });

    expect(queued(client)).toEqual(["three"]);
  });

  it("holds what the pool answered for each item under the batch's id", async () => {
    const { client } = await clientOver(pool(archivedNow));

    const id = await client.batch(["one"], { kind: "archive" });
    expect(read(client.batches).get(id)?.outcomes).toBeUndefined();
    await client.drain();

    expect(read(client.batches).get(id)).toMatchObject({
      items: ["one"],
      outcomes: [{ id: "one", outcome: "archived" }],
    });
  });

  it("puts back an item the pool refused, and keeps the ones it took", async () => {
    const { client } = await clientOver(
      pool((id) =>
        id === "two"
          ? { id, outcome: "refused", error: { code: "no-such-item" } }
          : archivedNow(id),
      ),
    );

    await client.batch(["one", "two"], { kind: "archive" });
    await client.drain();

    expect(queued(client)).toEqual(["two", "three"]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("puts back every item where the pool refused the batch whole", async () => {
    const { client } = await clientOver((request) =>
      routeOf(request) === "POST /v1/batches"
        ? refusal(404, "unknown-template", { template: "gone" })
        : pool(archivedNow)(request),
    );

    const id = await client.batch(["one", "two"], {
      kind: "template",
      template: "gone",
    });
    await client.drain();

    expect(queued(client)).toEqual(["one", "two", "three"]);
    expect(read(client.batches).has(id)).toBe(false);
    expect(read(client.outbox)[0]?.state).toBe("refused");
  });

  it("waits in the outbox while the pool is away, and goes as the same batch", async () => {
    const sent: Sent[] = [];
    const { client, transport } = await clientOver(pool(archivedNow, sent));
    transport.unreachable(true);

    const id = await client.batch(["one"], { kind: "archive" });
    await client.drain();
    expect(read(client.outbox)[0]?.state).toBe("unreachable");

    transport.unreachable(false);
    await client.drain();

    expect(sent.map((each) => each.batch)).toEqual([id]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("draws the reason an archive was given until the pool answers", async () => {
    const { client, transport } = await clientOver(pool(archivedNow));
    transport.unreachable(true);

    await client.batch(["one"], { kind: "archive", reason: "noise" });

    expect(read(client.held("one"))?.archived).toMatchObject({
      reason: "noise",
    });
  });

  it("draws nothing for a template this client does not hold", async () => {
    const { client, transport } = await clientOver(pool(archivedNow));
    await client.templates.load();
    transport.unreachable(true);

    await client.batch(["one"], { kind: "template", template: "elsewhere" });

    expect(read(client.queue).items[0]?.tags).toEqual([]);
  });

  it("draws the template's trigger tag on each item until the pool answers", async () => {
    const { client, transport } = await clientOver(pool(archivedNow));
    await client.templates.load();
    transport.unreachable(true);

    await client.batch(["one", "two"], {
      kind: "template",
      template: TEMPLATE.id,
    });

    for (const item of read(client.queue).items.slice(0, 2)) {
      expect(item.tags.map((tag) => tag.name)).toEqual(["route/research"]);
    }
  });
});

describe("cancelling many", () => {
  it("is one request, and reads each cancelled item again", async () => {
    const { client, transport } = await clientOver(async (request) => {
      const route = routeOf(request);
      if (route === "POST /v1/routing/cancel") {
        return json(200, {
          values: [
            { record: "r1", outcome: "cancelled" },
            {
              record: "r2",
              outcome: "refused",
              error: { code: "delivery-in-flight" },
            },
          ],
        });
      }
      if (route.startsWith("GET /v1/items/") && !route.endsWith("/routing")) {
        return json(200, anItem(route.split("/")[3]!));
      }
      return json(200, { values: [] });
    });

    const answer = await client.routing.cancelMany([
      { record: "r1", item: "one" },
      { record: "r2", item: "two" },
    ]);

    expect(answer.values.map((each) => each.outcome)).toEqual([
      "cancelled",
      "refused",
    ]);
    const routes = asked(transport).map(routeOf);
    expect(
      routes.filter((route) => route === "POST /v1/routing/cancel"),
    ).toHaveLength(1);
    expect(routes).toContain("GET /v1/items/one");
    expect(routes).not.toContain("GET /v1/items/two");
  });
});
