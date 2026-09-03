import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import type { Item as Held } from "@notemap/client";
import { anItem, json, read, routeOf } from "@notemap/client/testing";

import Queue from "$components/queue/Queue.svelte";
import { asked, client, pool } from "$testing/pool";
import { remember } from "$lib/order";
import { NO_ITEM_OFFLINE } from "$lib/said";
import Item from "./Item.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

/** The words a capture holds, kept apart from the id it is reached by. */
function saying(id: string, text: string): Held {
  return anItem(id, {
    payload: { type: "text", content: { text }, metadata: {}, assets: [] },
  });
}

/** The pool holds one item and no surface has drawn it: a deep link, exactly. */
function holding(item: Held) {
  return (request: Request) =>
    routeOf(request) === `GET /v1/items/${item.id}`
      ? json(200, item)
      : json(200, { values: [] });
}

test("draws an item the cache has never held, reaching the pool for it", async () => {
  pool(holding(saying("linked", "what the link names")));

  render(Item, { id: "linked" });

  expect(await screen.findByText("what the link names")).toBeDefined();
  expect(screen.getByText("payload")).toBeDefined();
  expect(screen.getByText("linked")).toBeDefined();
  expect(asked()).toContain("GET /v1/items/linked");
});

test("says there is no such item plainly, and not as a failure", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/items/gone"
      ? json(404, { error: { code: "no-such-item" } })
      : json(200, { values: [] }),
  );

  render(Item, { id: "gone" });

  expect(await screen.findByText(/No such item/)).toBeDefined();
  expect(screen.getByText("gone")).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("marks an item it drew from its own cache", async () => {
  const transport = pool((request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: [saying("held", "read before the pool went")] })
      : json(200, { values: [] }),
  );

  // What a surface read earlier is what a link followed offline can still draw.
  await client.loadQueue();
  transport.unreachable(true);

  render(Item, { id: "held" });

  // The held copy draws at once; the mark waits on the read that failed.
  expect(await screen.findByText("read before the pool went")).toBeDefined();
  expect(await screen.findByText("from cache")).toBeDefined();
});

test("says what is missing where nothing is held and the pool is out of reach", async () => {
  const transport = pool(() => json(200, { values: [] }));
  transport.unreachable(true);

  render(Item, { id: "never" });

  expect(await screen.findByText(NO_ITEM_OFFLINE)).toBeDefined();
  expect(screen.queryByText(/No such item/)).toBeNull();
});

/** Where the person had scrolled, as the browser would report it. */
function scrolledTo(at: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: at });
  return fireEvent.scroll(window);
}

test("costs the queue neither its order nor its place", async () => {
  remember("queue", "newest-first");
  const transport = pool((request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: [saying("held", "still in the queue")] })
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("still in the queue");
  await scrolledTo(240);
  cleanup();

  // An item view is scrolled like anything else, and none of that is the
  // queue's place: it is not a register and remembers nothing of its own.
  render(Item, { id: "held" });
  await screen.findByText("still in the queue");
  await scrolledTo(900);
  cleanup();

  render(Queue);
  await screen.findByText("still in the queue");

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 });
  });
  expect(read(client.queue).order).toBe("newest-first");
  expect(
    transport.sent
      .filter((request) => routeOf(request) === "GET /v1/queue")
      .map((request) => new URL(request.url).searchParams.get("order")),
  ).toEqual(["newest-first"]);
});
