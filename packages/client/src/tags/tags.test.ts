import type { Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { TagUse } from "../api/types";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import { anItem, routeOf } from "../testing/pool";
import { json, mockTransport, type Handler } from "../testing/transport";

function read<T>(source: Observable<T>): T {
  let seen: T | undefined;
  source
    .subscribe((value) => {
      seen = value;
    })
    .unsubscribe();
  return seen as T;
}

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  return { client, transport };
}

const use = (name: string, items: number): TagUse => ({
  name,
  items,
  lastUsedAt: "2026-08-17T10:00:00.000Z",
});

const inUse = (...values: readonly TagUse[]) => json(200, { values });

describe("the tags in use", () => {
  it("is empty until it is loaded, and holds what the pool answered after", async () => {
    const { client } = clientOver(() => inUse(use("kind/quote", 2)));

    expect(read(client.tags.inUse)).toEqual([]);

    await expect(client.tags.load()).resolves.toEqual([use("kind/quote", 2)]);
    expect(read(client.tags.inUse)).toEqual([use("kind/quote", 2)]);
  });

  it("goes on answering the last list it read when the pool is out of reach", async () => {
    const { client, transport } = clientOver(() => inUse(use("kind/quote", 1)));
    await client.tags.load();

    transport.unreachable(true);

    await expect(client.tags.load()).rejects.toBeInstanceOf(Unreachable);
    expect(read(client.tags.inUse)).toEqual([use("kind/quote", 1)]);
  });

  /** Completion offers what the person has just used, without waiting for a reload. */
  it("reads them again once a tag of its own reaches the pool", async () => {
    let counted = 0;
    const { client } = clientOver((request) => {
      if (routeOf(request) === "GET /v1/tags") {
        counted += 1;
        return inUse(use("kind/quote", counted));
      }
      return json(200, anItem("one"));
    });

    await client.tag("one", "kind/quote");
    await client.drain();

    expect(counted).toBe(1);
    expect(read(client.tags.inUse)).toEqual([use("kind/quote", 1)]);
  });
});
