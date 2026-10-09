import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "#testing/observing";
import { anItem, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";
import type { Item } from "#api/types";
import type { Client, ListState } from "../types";
import type { ActionsSince } from "./watching";

const ids = (list: ListState) => list.items.map((item) => item.id);

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
  vi.useRealTimers();
});

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  built.push(client);
  return { client, transport };
}

/** Lets everything the client starts on its own run to a stop. */
async function quiet(): Promise<void> {
  for (let turns = 0; turns < 20; turns += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

function anAction(
  id: string,
  kind: string,
  subject?: string,
  detail: Record<string, unknown> = {},
) {
  return {
    id,
    kind,
    ...(subject === undefined ? {} : { subject }),
    by: { kind: "person" },
    at: "2026-09-08T10:00:00.000Z",
    detail,
  };
}

const ROUTED = {
  records: 1,
  pending: 0,
  to: [{ kind: "destination", destination: "vault" }],
  templates: ["research"],
} satisfies Item["routing"];

type Page = { readonly values: readonly Item[]; readonly next?: string };

type Pool = {
  readonly after?: readonly Record<string, unknown>[];
  readonly queue?: Page;
  readonly feed?: Page;
  /** What a read of an item answers, by id; an id missing here the pool does not hold. */
  readonly items?: Readonly<Record<string, Item>>;
};

const MORE = "/v1/queue?after=2026-08-17T10:00:00.000Z,two";

/**
 * The queue holds two, and the log answers a first page that is only the mark,
 * then whatever the test has happen after it. Read again, `one` has been routed.
 */
function pool(...after: Record<string, unknown>[]) {
  return poolWith({ after });
}

function poolWith({
  after = [],
  queue = { values: [anItem("one"), anItem("two")] },
  feed = { values: [] },
  items = { one: anItem("one", { routing: ROUTED }) },
}: Pool) {
  let turns = 0;
  return (request: Request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, queue);
    if (route === "GET /v1/feed") return json(200, feed);

    if (route === "GET /v1/items") {
      const asked = new URL(request.url).searchParams.getAll("id");
      return json(200, {
        values: asked.flatMap((id) => (id in items ? [items[id]] : [])),
      });
    }

    if (route === "GET /v1/actions") {
      turns += 1;
      return json(200, {
        values: turns === 1 ? [anAction("a0", "captured")] : after,
      });
    }

    return json(200, { values: [] });
  };
}

/** Subscribing is what builds the watcher; nothing asks before somebody looks. */
function watch(client: Client, heard: ActionsSince[] = []): () => void {
  const held = client.actions
    .watch()
    .subscribe((since) => void heard.push(since));
  return () => held.unsubscribe();
}

/** The mark, then one turn of the tempo and everything it reads. */
async function turn(): Promise<void> {
  await quiet();
  await vi.advanceTimersByTimeAsync(10_000);
  await quiet();
}

const itemsAsked = (sent: readonly Request[]) =>
  sent
    .filter((request) => routeOf(request) === "GET /v1/items")
    .map((request) => new URL(request.url).searchParams.getAll("id"));

describe("what the pool did while nobody was asking", () => {
  it("takes a row off the queue when the log says it was processed", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      pool(anAction("a1", "routed", "one"), anAction("a0", "captured")),
    );

    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["one", "two"]);

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(ids(read(client.queue))).toEqual(["two"]);
    stop();
  });

  it("takes a row off the queue when a trigger tag fires, before anything has landed", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      pool(anAction("a1", "template-fired", "one"), anAction("a0", "captured")),
    );

    await client.enter("queue");

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(ids(read(client.queue))).toEqual(["two"]);
    stop();
  });

  it("reads a routed item again, so the copy it holds stops saying it is work", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(
      pool(anAction("a1", "routed", "one"), anAction("a0", "captured")),
    );

    await client.enter("queue");

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(itemsAsked(transport.sent)).toEqual([["one"]]);
    expect(read(client.held("one"))?.routing).toEqual(ROUTED);
    stop();
  });

  it("reads nothing again for an item it does not hold", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(
      pool(anAction("a1", "routed", "elsewhere"), anAction("a0", "captured")),
    );

    await client.enter("queue");

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(itemsAsked(transport.sent)).toEqual([]);
    stop();
  });

  it("leaves an item alone while an operation on it is still to send", async () => {
    vi.useFakeTimers();
    let answer: (response: Response) => void = () => undefined;
    const answered = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const routed = pool(
      anAction("a1", "routed", "one"),
      anAction("a0", "captured"),
    );
    const { client, transport } = clientOver((request) =>
      routeOf(request) === "POST /v1/items/one/tag"
        ? answered
        : routed(request),
    );

    await client.enter("queue");
    await client.tag("one", "art");

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(itemsAsked(transport.sent)).toEqual([]);
    expect(read(client.held("one"))?.tags?.map((tag) => tag.name)).toEqual([
      "art",
    ]);

    answer(json(200, anItem("one", { tags: [] })));
    stop();
  });

  it("leaves the queue alone for an action that processed nothing", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      pool(anAction("a1", "tagged", "one"), anAction("a0", "captured")),
    );

    await client.enter("queue");

    const stop = watch(client);
    await quiet();
    await vi.advanceTimersByTimeAsync(10_000);
    await quiet();

    expect(ids(read(client.queue))).toEqual(["one", "two"]);
    stop();
  });

  it("asks the pool nothing while nobody is watching", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(pool());

    await client.enter("queue");
    await quiet();
    await vi.advanceTimersByTimeAsync(60_000);
    await quiet();

    expect(transport.sent.map(routeOf)).not.toContain("GET /v1/actions");
  });
});

const LATER = "2026-09-08T09:00:00.000Z";

const fresh = (id: string, overrides: Partial<Item> = {}) =>
  anItem(id, { createdAt: LATER, ...overrides });

describe("what arrived from elsewhere", () => {
  it("lands a capture at the head of the feed, read with the others in one request", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(
      poolWith({
        feed: { values: [anItem("one"), anItem("two")] },
        after: [
          anAction("a2", "captured", "new-b"),
          anAction("a1", "captured", "new-a"),
          anAction("a0", "captured"),
        ],
        items: {
          "new-a": fresh("new-a"),
          "new-b": fresh("new-b", { createdAt: "2026-09-08T09:01:00.000Z" }),
        },
      }),
    );
    await client.enter("feed");

    const heard: ActionsSince[] = [];
    const stop = watch(client, heard);
    await turn();

    expect(ids(read(client.feed)).slice(0, 2)).toEqual(["new-b", "new-a"]);
    expect(itemsAsked(transport.sent)).toEqual([["new-a", "new-b"]]);
    expect(heard[0]?.arrived).toEqual(["new-a", "new-b"]);
    stop();
  });

  it("tells a shell of an arrival once it already holds it", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        after: [anAction("a1", "captured", "new"), anAction("a0", "captured")],
        items: { new: fresh("new") },
      }),
    );
    await client.enter("feed");

    const heldWhenTold: unknown[] = [];
    const held = client.actions
      .watch()
      .subscribe(() => heldWhenTold.push(read(client.held("new"))?.id));
    await turn();

    expect(heldWhenTold).toEqual(["new"]);
    held.unsubscribe();
  });

  it("leaves a capture to the queue's next page while there is one", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        queue: { values: [anItem("one"), anItem("two")], next: MORE },
        after: [anAction("a1", "captured", "new"), anAction("a0", "captured")],
        items: { new: fresh("new") },
      }),
    );
    await client.enter("queue");

    const stop = watch(client);
    await turn();

    expect(ids(read(client.queue))).toEqual(["one", "two"]);
    stop();
  });

  it("appends a capture to a queue read to its end", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        after: [anAction("a1", "captured", "new"), anAction("a0", "captured")],
        items: { new: fresh("new") },
      }),
    );
    await client.enter("queue");

    const stop = watch(client);
    await turn();

    expect(ids(read(client.queue))).toEqual(["one", "two", "new"]);
    stop();
  });

  it("keeps a capture off a filter it does not match, and on the whole page beside it", async () => {
    vi.useFakeTimers();
    const quote = {
      name: "kind/quote",
      by: { kind: "person" as const },
      addedAt: LATER,
    };
    const { client } = clientOver(
      poolWith({
        feed: { values: [anItem("one", { tags: [quote] })] },
        after: [
          anAction("a2", "captured", "quoted"),
          anAction("a1", "captured", "plain"),
          anAction("a0", "captured"),
        ],
        items: {
          plain: fresh("plain"),
          quoted: fresh("quoted", { tags: [quote] }),
        },
      }),
    );
    await client.enter("feed");
    await client.enter("feed", undefined, ["kind/quote"]);

    const stop = watch(client);
    await turn();

    expect(ids(read(client.feed))).toEqual(["quoted", "one"]);
    await client.enter("feed");
    expect(ids(read(client.feed))).toEqual(["quoted", "plain", "one"]);
    stop();
  });

  it("reads the item a revision made, which the action names in its detail", async () => {
    vi.useFakeTimers();
    const { client, transport } = clientOver(
      poolWith({
        after: [
          anAction("a1", "revised", "one", { revision: "one-again" }),
          anAction("a0", "captured"),
        ],
        items: { "one-again": fresh("one-again", { revisionOf: "one" }) },
      }),
    );
    await client.enter("queue");

    const heard: ActionsSince[] = [];
    const stop = watch(client, heard);
    await turn();

    expect(itemsAsked(transport.sent)).toEqual([["one-again"]]);
    expect(ids(read(client.queue))).toEqual(["two", "one-again"]);
    expect(heard[0]?.arrived).toEqual(["one-again"]);
    stop();
  });

  it("puts an item unarchived elsewhere back on the queue", async () => {
    vi.useFakeTimers();
    const archived = anItem("gone", {
      createdAt: "2026-08-17T09:00:00.000Z",
      archived: { archivedAt: "2026-08-17T11:00:00.000Z" },
    });
    const { client } = clientOver(
      poolWith({
        feed: { values: [archived] },
        after: [
          anAction("a1", "unarchived", "gone"),
          anAction("a0", "captured"),
        ],
        items: { gone: anItem("gone", { createdAt: archived.createdAt }) },
      }),
    );
    await client.enter("feed");
    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["one", "two"]);

    const heard: ActionsSince[] = [];
    const stop = watch(client, heard);
    await turn();

    expect(ids(read(client.queue))).toEqual(["gone", "one", "two"]);
    expect(heard[0]?.arrived).toEqual([]);
    stop();
  });

  it("puts an item it never held back on the queue when its delivery is given up on", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        after: [
          anAction("a1", "work-abandoned", "back", { record: "record-1" }),
          anAction("a0", "captured"),
        ],
        items: {
          back: anItem("back", { createdAt: "2026-08-17T09:00:00.000Z" }),
        },
      }),
    );
    await client.enter("queue");

    const stop = watch(client);
    await turn();

    expect(ids(read(client.queue))).toEqual(["back", "one", "two"]);
    stop();
  });

  it("files a capture a trigger tag fired on the feed, and not on the queue", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        after: [
          anAction("a2", "template-fired", "filed"),
          anAction("a1", "captured", "filed"),
          anAction("a0", "captured"),
        ],
        items: { filed: fresh("filed", { routing: ROUTED }) },
      }),
    );
    await client.enter("feed");
    await client.enter("queue");

    const stop = watch(client);
    await turn();

    expect(ids(read(client.queue))).toEqual(["one", "two"]);
    expect(ids(read(client.feed))).toEqual(["filed"]);
    stop();
  });

  it("forgets a held item the pool left out of its answer", async () => {
    vi.useFakeTimers();
    const { client } = clientOver(
      poolWith({
        after: [anAction("a1", "routed", "two"), anAction("a0", "captured")],
      }),
    );
    await client.enter("queue");

    const stop = watch(client);
    await turn();

    expect(read(client.held("two"))).toBeUndefined();
    expect(ids(read(client.queue))).toEqual(["one"]);
    stop();
  });

  it("says nothing arrived for a capture it made itself", async () => {
    vi.useFakeTimers();
    let mine = "";
    const over = poolWith({ items: {} });
    let turns = 0;
    const { client, transport } = clientOver(async (request) => {
      const route = routeOf(request);
      if (route === "POST /v1/captures") {
        const body = (await request.json()) as { id: string };
        mine = body.id;
        return json(201, {
          kind: "captured",
          item: fresh(mine),
          matchedOn: "id",
        });
      }
      if (route === "GET /v1/actions") {
        turns += 1;
        return json(200, {
          values:
            turns === 1
              ? [anAction("a0", "captured")]
              : [anAction("a1", "captured", mine), anAction("a0", "captured")],
        });
      }
      return over(request);
    });
    await client.enter("feed");

    const heard: ActionsSince[] = [];
    const stop = watch(client, heard);
    await quiet();
    await client.capture({ channel: "web", text: "mine" });
    await turn();

    expect(heard[0]?.arrived).toEqual([]);
    expect(itemsAsked(transport.sent)).toEqual([]);
    stop();
  });

  it("reads no revision of an item with an edit still to send", async () => {
    vi.useFakeTimers();
    let answer: (response: Response) => void = () => undefined;
    const answered = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const revised = poolWith({
      after: [
        anAction("a1", "revised", "one", { revision: "one-again" }),
        anAction("a0", "captured"),
      ],
      items: { "one-again": fresh("one-again") },
    });
    const { client, transport } = clientOver((request) =>
      routeOf(request) === "POST /v1/items/one/edit"
        ? answered
        : revised(request),
    );
    await client.enter("queue");
    await client.edit(
      "one",
      { type: "note", content: { text: "again" }, metadata: {}, assets: [] },
      "test",
    );

    const heard: ActionsSince[] = [];
    const stop = watch(client, heard);
    await turn();

    expect(itemsAsked(transport.sent)).toEqual([]);
    expect(heard[0]?.arrived).toEqual([]);

    answer(json(500, {}));
    stop();
  });
});
