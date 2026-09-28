import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { read } from "#testing/observing";
import { anItem, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";
import type { Item } from "#api/types";
import type { Client, ListState } from "../types";

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

const PERSON = { kind: "person" } as const;

function tagged(id: string, minute: number, ...names: string[]): Item {
  const at = `2026-08-17T10:0${String(minute)}:00.000Z`;
  return anItem(id, {
    createdAt: at,
    tags: names.map((name) => ({ name, by: PERSON, addedAt: at })),
  });
}

const ITEMS = [
  tagged("one", 1, "kind/quote"),
  tagged("two", 2, "project/a"),
  tagged("three", 3, "kind/quote", "project/a"),
];

/** The queue as a pool would answer it, filtered by every `tag` asked for. */
function pool(items: readonly Item[] = ITEMS): Handler {
  return (request) => {
    const route = routeOf(request);
    if (route !== "GET /v1/queue" && route !== "GET /v1/feed")
      return json(200, { values: [] });

    const filter = new URL(request.url).searchParams.getAll("tag");
    return json(200, {
      values: items.filter((item) =>
        filter.every((name) => item.tags?.some((held) => held.name === name)),
      ),
    });
  };
}

const tagsAsked = (sent: readonly Request[], route: string) =>
  sent
    .filter((request) => routeOf(request) === route)
    .map((request) => new URL(request.url).searchParams.getAll("tag"));

describe("a surface read through a filter", () => {
  it("asks the pool for every tag, and says what it is filtered by", async () => {
    const { client, transport } = clientOver(pool());

    await client.enter("queue", undefined, ["kind/quote", " project/a "]);

    expect(ids(read(client.queue))).toEqual(["three"]);
    expect(read(client.queue).filter).toEqual(["kind/quote", "project/a"]);
    expect(tagsAsked(transport.sent, "GET /v1/queue")).toEqual([
      ["kind/quote", "project/a"],
    ]);
  });

  it("goes back to the whole page as it stood, without reading the feed again", async () => {
    const { client, transport } = clientOver(pool());

    await client.enter("feed");
    await client.enter("feed", undefined, ["project/a"]);
    expect(ids(read(client.feed))).toEqual(["two", "three"]);

    await client.enter("feed");

    expect(ids(read(client.feed))).toEqual(["one", "two", "three"]);
    expect(read(client.feed).filter).toEqual([]);
    expect(tagsAsked(transport.sent, "GET /v1/feed")).toEqual([
      [],
      ["project/a"],
    ]);
  });

  it("drops a row whose filter tag is taken off, and keeps it on the whole page", async () => {
    const { client } = clientOver(pool());
    await client.enter("queue");
    await client.enter("queue", undefined, ["kind/quote"]);
    expect(ids(read(client.queue))).toEqual(["one", "three"]);

    await client.untag("one", "kind/quote");

    expect(ids(read(client.queue))).toEqual(["three"]);
    await client.enter("queue");
    expect(ids(read(client.queue))).toEqual(["one", "two", "three"]);
  });

  it("takes an item tagged into the filter where the page reaches", async () => {
    const { client } = clientOver(pool());
    await client.enter("queue");
    await client.enter("queue", undefined, ["kind/quote"]);

    await client.tag("two", "kind/quote");

    expect(ids(read(client.queue))).toEqual(["one", "two", "three"]);
  });

  it("draws the cached items carrying every tag while the pool is away", async () => {
    const { client, transport } = clientOver(pool());
    await client.enter("queue");

    transport.unreachable(true);
    await client.enter("queue", undefined, ["project/a"]);

    const list = read(client.queue);
    expect(list.fromCache).toBe(true);
    expect(ids(list)).toEqual(["two", "three"]);
  });

  it("follows a tag taken off on another device, from the log", async () => {
    vi.useFakeTimers();
    let turns = 0;
    const answer = pool();
    const { client } = clientOver((request) => {
      if (routeOf(request) !== "GET /v1/actions") return answer(request);
      turns += 1;
      const mark = {
        id: "a0",
        kind: "captured",
        by: PERSON,
        at: "2026-08-17T11:00:00.000Z",
        detail: {},
      };
      const untagged = {
        id: "a1",
        kind: "untagged",
        subject: "three",
        by: PERSON,
        at: "2026-08-17T11:01:00.000Z",
        detail: { tag: "kind/quote" },
      };
      return json(200, { values: turns === 1 ? [mark] : [untagged, mark] });
    });

    await client.enter("queue", undefined, ["kind/quote"]);
    const held = client.actions.watch().subscribe(() => undefined);
    for (let turn = 0; turn < 20; turn += 1)
      await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    for (let turn = 0; turn < 20; turn += 1)
      await vi.advanceTimersByTimeAsync(0);

    expect(ids(read(client.queue))).toEqual(["one"]);
    expect(read(client.held("three"))?.tags?.map((tag) => tag.name)).toEqual([
      "project/a",
    ]);
    held.unsubscribe();
  });

  it("goes back to a feed of several pages as it stood, reading nothing past it", async () => {
    const many = Array.from({ length: 30 }, (_, at) =>
      anItem(`item-${String(at).padStart(2, "0")}`, {
        createdAt: `2026-08-17T10:${String(at).padStart(2, "0")}:00.000Z`,
        tags:
          at % 2 === 0
            ? [
                {
                  name: "kind/quote",
                  by: PERSON,
                  addedAt: "2026-08-17T10:00:00.000Z",
                },
              ]
            : [],
      }),
    );
    const { client, transport } = clientOver((request) => {
      const url = new URL(request.url);
      const filter = url.searchParams.getAll("tag");
      const after = url.searchParams.get("after");
      const kept = many.filter((item) =>
        filter.every((name) => item.tags?.some((held) => held.name === name)),
      );
      const from =
        after === null ? 0 : kept.findIndex((item) => item.id === after) + 1;
      const values = kept.slice(from, from + 25);
      const last = values.at(-1);
      return json(200, {
        values,
        ...(from + 25 < kept.length && last !== undefined
          ? { next: `/v1/feed?after=${last.createdAt},${last.id}` }
          : {}),
      });
    });

    await client.enter("feed");
    await client.enter("feed", undefined, ["kind/quote"]);
    await client.enter("feed");

    expect(read(client.feed).items).toHaveLength(25);
    expect(tagsAsked(transport.sent, "GET /v1/feed")).toEqual([
      [],
      ["kind/quote"],
    ]);
  });

  it("lands a whole read that answers after a filter was put on, for when it comes off", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => (release = done));
    const answer = pool();
    const { client } = clientOver(async (request) => {
      if (new URL(request.url).searchParams.getAll("tag").length === 0)
        await gate;
      return answer(request);
    });

    const whole = client.enter("feed");
    await client.enter("feed", undefined, ["kind/quote"]);
    release();
    await whole;
    await client.enter("feed");

    const list = read(client.feed);
    expect(list.loading).toBe(false);
    expect(ids(list)).toEqual(["one", "two", "three"]);
  });

  it("drops a filtered read that answers after its filter was changed", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => (release = done));
    const answer = pool();
    const { client } = clientOver(async (request) => {
      if (new URL(request.url).searchParams.getAll("tag")[0] === "kind/quote")
        await gate;
      return answer(request);
    });

    const first = client.enter("queue", undefined, ["kind/quote"]);
    await client.enter("queue", undefined, ["project/a"]);
    release();
    await first;

    const list = read(client.queue);
    expect(list.filter).toEqual(["project/a"]);
    expect(ids(list)).toEqual(["two", "three"]);
    expect(list.loading).toBe(false);
  });
});
