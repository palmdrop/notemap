import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "./adapters/memory-store";
import type { Item } from "./api/types";
import { createClient } from "./client";
import { read } from "./testing/observing";
import { anItem, routeOf, stoppedClock } from "./testing/pool";
import {
  json,
  mockTransport,
  refusal,
  type Handler,
} from "./testing/transport";
import type { ListState } from "./types";

/** The channel the shell's edits arrive through, as its captures do. */
const TYPED = "web-manual";

const clock = stoppedClock();

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({
    transport,
    store: createMemoryStore(),
    now: clock.now,
  });
  return { client, transport };
}

const ids = (list: ListState) => list.items.map((item) => item.id);
const says = (list: ListState) =>
  list.items.map((item) => item.payload.content["text"]);

/** A queue of one loaded item, and a handler for whatever the test then does. */
async function overOne(handler: Handler, held: Item = anItem("one")) {
  const { client, transport } = clientOver((request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: [held] })
      : handler(request),
  );

  await client.loadQueue();
  return { client, transport };
}

const payload = (text: string) => ({
  type: "text",
  content: { text },
  metadata: {},
  assets: [],
});

beforeEach(() => {
  clock.set("2026-08-17T12:00:00.000Z");
});

describe("the hand-over seal", () => {
  it("never re-sends a capture body under an id it has already handed over", async () => {
    const { client, transport } = clientOver(async (request) => {
      if (routeOf(request) === "POST /v1/captures") {
        const body = (await request.json()) as { id: string };
        return json(201, { kind: "captured", item: anItem(body.id) });
      }
      return json(200, { kind: "amended", item: anItem("captured") });
    });

    // Unreachable is still handed over: a lost response hides a capture the
    // pool holds, and the client cannot tell the two apart.
    transport.unreachable(true);
    const pending = await client.capture({ channel: "web", text: "a draft" });
    transport.unreachable(false);

    await client.edit(pending.id, payload("a better draft"), TYPED);
    await client.drain();

    const captures = transport.sent.filter(
      (request) => routeOf(request) === "POST /v1/captures",
    );
    const bodies = await Promise.all(
      captures.map(
        async (request) =>
          ((await request.json()) as { payload: { content: { text: string } } })
            .payload.content.text,
      ),
    );
    // Every body sent under that id says what the capture said; the change
    // reached the pool as an edit.
    expect(new Set(bodies)).toEqual(new Set(["a draft"]));
    expect(
      transport.sent.map(routeOf).filter((route) => route.endsWith("/edit")),
    ).toHaveLength(1);
  });

  it("sends a domain edit once the capture has been handed over", async () => {
    const { client, transport } = await overOne((request) =>
      routeOf(request) === "POST /v1/items/one/edit"
        ? json(200, {
            kind: "amended",
            item: { ...anItem("one"), payload: payload("said again") },
          })
        : json(200, {}),
    );

    await client.edit("one", payload("said again"), TYPED);
    await client.drain();

    expect(
      transport.sent.map(routeOf).includes("POST /v1/items/one/edit"),
    ).toBe(true);
    expect(says(read(client.queue))).toEqual(["said again"]);
    expect(read(client.outbox)).toEqual([]);
  });
});

describe("amend versus revise", () => {
  it("shows the edit before the pool answers", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { client } = await overOne(async () => {
      await held;
      return json(200, {
        kind: "amended",
        item: { ...anItem("one"), payload: payload("edited") },
      });
    });

    await client.edit("one", payload("edited"), TYPED);
    expect(says(read(client.queue))).toEqual(["edited"]);

    release();
    await client.drain();
    expect(says(read(client.queue))).toEqual(["edited"]);
  });

  it("settles an optimistic amendment into the revision the pool recorded", async () => {
    const revision: Item = {
      ...anItem("two"),
      payload: payload("edited"),
      revisionOf: "one",
      contentUpdatedAt: "2026-08-17T12:00:00.000Z",
    };

    const { client } = await overOne(() =>
      json(200, { kind: "revised", revision, revisionOf: "one" }),
    );

    await client.edit("one", payload("edited"), TYPED);
    // The guess: an amendment in place, under the original's id.
    expect(ids(read(client.queue))).toEqual(["one"]);

    await client.drain();

    expect(ids(read(client.queue))).toEqual(["two"]);
    expect(says(read(client.queue))).toEqual(["edited"]);
    expect(read(client.outbox)).toEqual([]);
  });

  it("leaves the original as the pool holds it, not as the guess drew it", async () => {
    const revision: Item = {
      ...anItem("two"),
      payload: payload("edited"),
      revisionOf: "one",
    };

    const { client } = await overOne((request) =>
      routeOf(request) === "POST /v1/items/one/edit"
        ? json(200, { kind: "revised", revision, revisionOf: "one" })
        : json(200, anItem("one")),
    );

    await client.edit("one", payload("edited"), TYPED);
    await client.drain();

    const original = await client.item("one");
    expect(original?.payload.content["text"]).toBe("one");
  });

  it("keeps the item a revision was made from out of the queue", async () => {
    const revision: Item = {
      ...anItem("two"),
      payload: payload("edited"),
      revisionOf: "one",
    };

    const { client } = await overOne((request) =>
      routeOf(request) === "POST /v1/items/one/edit"
        ? json(200, { kind: "revised", revision, revisionOf: "one" })
        : json(200, { ...anItem("one"), revisedInto: ["two"] }),
    );

    await client.edit("one", payload("edited"), TYPED);
    await client.drain();
    expect(ids(read(client.queue))).toEqual(["two"]);

    // An operation still naming it settles with the item the pool holds, which
    // names a revision — so it does not come back as work.
    await client.tag("one", "kind/quote");
    await client.drain();

    expect(ids(read(client.queue))).toEqual(["two"]);
  });

  it("leaves an amended item where it was drawn in the queue", async () => {
    const { client } = await clientOver((request) =>
      routeOf(request) === "GET /v1/queue"
        ? json(200, {
            values: [
              anItem("one"),
              { ...anItem("two"), createdAt: "2026-08-17T11:00:00.000Z" },
            ],
          })
        : json(200, {
            kind: "amended",
            item: {
              ...anItem("one"),
              payload: payload("edited"),
              contentUpdatedAt: "2026-08-17T13:00:00.000Z",
            },
          }),
    );
    await client.loadQueue();

    await client.edit("one", payload("edited"), TYPED);
    await client.drain();

    expect(ids(read(client.queue))).toEqual(["one", "two"]);
  });

  it("claims one identity across every retry, so a retried edit is one revision", async () => {
    const revision: Item = {
      ...anItem("two"),
      payload: payload("edited"),
      revisionOf: "one",
    };

    const { client, transport } = await overOne(() =>
      json(200, { kind: "revised", revision, revisionOf: "one" }),
    );

    transport.unreachable(true);
    await client.edit("one", payload("edited"), TYPED);
    await client.drain();
    transport.unreachable(false);
    await client.drain();

    const edits = transport.sent.filter(
      (request) => routeOf(request) === "POST /v1/items/one/edit",
    );
    const identities = await Promise.all(
      edits.map(
        async (request) =>
          ((await request.json()) as { source: string; sourceItemId: string })
            .sourceItemId,
      ),
    );

    expect(edits.length).toBeGreaterThan(1);
    expect(new Set(identities).size).toBe(1);
  });

  it("carries the source it was given, not the item's", async () => {
    const { client, transport } = await overOne(
      () =>
        json(200, {
          kind: "amended",
          item: { ...anItem("one"), payload: payload("edited") },
        }),
      anItem("one", { source: "a-watched-folder" }),
    );

    await client.edit("one", payload("edited"), TYPED);
    await client.drain();

    const sent = transport.sent.find(
      (request) => routeOf(request) === "POST /v1/items/one/edit",
    );
    expect((await sent?.json()) as { source: string }).toMatchObject({
      source: TYPED,
    });
  });

  it("rolls a refused edit back and says why", async () => {
    const { client } = await overOne(() =>
      refusal(422, "payload-type-changed", { from: "text" }),
    );

    await client.edit("one", payload("edited"), TYPED);
    await client.drain();

    expect(says(read(client.queue))).toEqual(["one"]);
    expect(read(client.outbox)[0]?.state).toBe("refused");
    expect(read(client.outbox)[0]?.failure).toBe(
      "an edit cannot change what kind of thing this is",
    );
  });
});

describe("classification", () => {
  it("shows a tag at once and leaves the item in the queue", async () => {
    const tagged: Item = {
      ...anItem("one"),
      tags: [
        {
          name: "kind/quote",
          by: { kind: "person" },
          addedAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    };

    const { client, transport } = await overOne(() => json(200, tagged));

    await client.tag("one", "kind/quote");
    expect(read(client.queue).items[0]?.tags?.map((tag) => tag.name)).toEqual([
      "kind/quote",
    ]);
    expect(ids(read(client.queue))).toEqual(["one"]);

    await client.drain();
    expect(
      await transport.sent
        .filter((request) => routeOf(request) === "POST /v1/items/one/tag")[0]!
        .json(),
    ).toEqual({ tag: "kind/quote" });
    expect(read(client.outbox)).toEqual([]);
  });

  it("removes a tag, and rolls back a removal the pool refuses", async () => {
    const tagged: Item = {
      ...anItem("one"),
      tags: [
        {
          name: "kind/quote",
          by: { kind: "person" },
          addedAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    };

    const { client } = clientOver((request) =>
      routeOf(request) === "GET /v1/queue"
        ? json(200, { values: [tagged] })
        : refusal(404, "no-such-item"),
    );
    await client.loadQueue();

    await client.untag("one", "kind/quote");
    expect(read(client.queue).items[0]?.tags).toEqual([]);

    await client.drain();
    expect(read(client.queue).items[0]?.tags?.map((tag) => tag.name)).toEqual([
      "kind/quote",
    ]);
  });
});
