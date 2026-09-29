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

/** Lets everything the client starts on its own run to a stop. */
async function quiet(): Promise<void> {
  for (let turns = 0; turns < 20; turns += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

function anAction(id: string, kind: string, subject?: string) {
  return {
    id,
    kind,
    ...(subject === undefined ? {} : { subject }),
    by: { kind: "person" },
    at: "2026-09-08T10:00:00.000Z",
    detail: {},
  };
}

const ROUTED = {
  records: 1,
  pending: 0,
  to: [{ kind: "destination", destination: "vault" }],
  templates: ["research"],
} satisfies Item["routing"];

/**
 * The queue holds two, and the log answers a first page that is only the mark,
 * then whatever the test has happen after it. Read again, `one` has been routed.
 */
function pool(...after: Record<string, unknown>[]) {
  let turns = 0;
  return (request: Request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue")
      return json(200, { values: [anItem("one"), anItem("two")] });

    if (route === "GET /v1/items/one")
      return json(200, anItem("one", { routing: ROUTED }));

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
function watch(client: Client): () => void {
  const held = client.actions.watch().subscribe(() => undefined);
  return () => held.unsubscribe();
}

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

    expect(transport.sent.map(routeOf)).toContain("GET /v1/items/one");
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

    expect(transport.sent.map(routeOf)).not.toContain(
      "GET /v1/items/elsewhere",
    );
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

    expect(transport.sent.map(routeOf)).not.toContain("GET /v1/items/one");
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
