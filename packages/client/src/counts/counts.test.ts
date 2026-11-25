import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import type { Client } from "../types";
import { read, until } from "#testing/observing";
import { anItem, routeOf } from "#testing/pool";
import { json, mockTransport, type Handler } from "#testing/transport";

const built: Client[] = [];

afterEach(() => {
  for (const client of built.splice(0)) client.close();
});

function clientOver(handler: Handler, counted: () => number) {
  const transport = mockTransport(handler);
  let asked = 0;
  transport.counts = () => {
    asked += 1;
    return json(200, { queue: counted() });
  };
  const client = createClient({ transport, store: createMemoryStore() });
  built.push(client);
  return { client, transport, asked: () => asked };
}

describe("the pool's counts", () => {
  it("asks what was captured since this device's midnight, and holds it as today's", async () => {
    let asked: URL | undefined;
    const transport = mockTransport((request) => {
      asked = new URL(request.url);
      return json(200, { queue: 1, captured: 4 });
    });
    transport.counts = null;
    const client = createClient({ transport, store: createMemoryStore() });
    built.push(client);

    await client.counts.load();

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(asked?.searchParams.get("since")).toBe(midnight.toISOString());
    expect(read(client.counts.capturedToday)).toBe(4);
  });

  it("is absent until the pool has answered, and holds its answer after", async () => {
    const { client } = clientOver(
      () => json(200, {}),
      () => 3,
    );

    expect(read(client.counts.queue)).toBeUndefined();

    await expect(client.counts.load()).resolves.toEqual({ queue: 3 });
    expect(read(client.counts.queue)).toBe(3);
  });

  it("keeps the last answer when the pool is out of reach", async () => {
    const { client, transport } = clientOver(
      () => json(200, {}),
      () => 2,
    );
    await client.counts.load();

    transport.unreachable(true);

    await expect(client.counts.load()).rejects.toBeInstanceOf(Unreachable);
    expect(read(client.counts.queue)).toBe(2);
  });

  /** A capture lands in the queue, so what it counts has moved. */
  it("reads again once its own work reaches the pool", async () => {
    let queued = 0;
    const { client, asked } = clientOver(
      (request) =>
        routeOf(request) === "POST /v1/captures"
          ? json(201, anItem("one"))
          : json(200, {}),
      () => queued,
    );
    await client.drain();
    const before = asked();

    queued = 1;
    await client.capture({ channel: "web", text: "a thought" });
    await client.drain();

    await until(() => read(client.counts.queue) === 1);
    expect(read(client.counts.queue)).toBe(1);
    expect(asked()).toBe(before + 1);
  });

  it("asks once more, not once per ask, while a read is out", async () => {
    const { client, asked } = clientOver(
      () => json(200, {}),
      () => 1,
    );
    await client.drain();
    const before = asked();

    await Promise.all([
      client.counts.load(),
      client.counts.load(),
      client.counts.load(),
    ]);
    await until(() => asked() === before + 2);

    expect(asked()).toBe(before + 2);
  });
});
