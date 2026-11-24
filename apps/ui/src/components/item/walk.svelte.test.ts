import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";

import { walkOf } from "./walk.svelte";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function walking(id: string) {
  let walk: ReturnType<typeof walkOf> | undefined;
  cleanup = $effect.root(() => {
    walk = walkOf(() => id);
  });
  flushSync();
  return walk!;
}

function serving(queue: string[], feed: string[]) {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") {
      return json(200, { values: queue.map((id) => anItem(id)) });
    }
    if (route === "GET /v1/feed") {
      return json(200, { values: feed.map((id) => anItem(id)) });
    }
    return json(200, { values: [] });
  });
}

test("an item on the queue walks the queue, and goes home to it", async () => {
  serving(["one", "two"], ["done"]);
  await client.loadQueue();
  const walk = walking("two");

  expect(walk.home).toBe("/");
  expect(walk.at).toBe(1);
  expect(walk.previous?.id).toBe("one");
  expect(walk.next).toBeUndefined();
});

test("opened at its address, the queue is read for it", async () => {
  serving(["one", "two"], []);
  const walk = walking("two");

  await vi.waitFor(() => {
    flushSync();
    expect(walk.at).toBe(1);
  });
  expect(walk.home).toBe("/");
  expect(walk.previous?.id).toBe("one");
});
