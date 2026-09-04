import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { Item as Held } from "@notemap/client";
import { anItem, json, read, routeOf } from "@notemap/client/testing";

import Queue from "$components/queue/Queue.svelte";
import { asked, client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import { remember } from "$lib/order";
import { NO_ITEM_OFFLINE, NO_RECORDS_OFFLINE } from "$lib/said";
import Item from "./Item.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

/** `done` opens the field for where it went, and `⏎` sends it, empty or not. */
async function done() {
  await fireEvent.click(screen.getByRole("button", { name: "done" }));
  await fireEvent.keyDown(screen.getByLabelText("where it went"), {
    key: "Enter",
  });
}

afterEach(() => {
  notices.clear();
});

/** The words a capture holds, kept apart from the id it is reached by. */
function saying(id: string, text: string, more: object = {}): Held {
  return anItem(id, {
    payload: { type: "text", content: { text }, metadata: {}, assets: [] },
    ...more,
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
  expect(asked()).toContain("GET /v1/items/linked");
});

test("draws the item and not its bookkeeping", async () => {
  pool(holding(saying("linked", "what the link names")));

  render(Item, { id: "linked" });
  await screen.findByText("what the link names");

  // An id and a channel are notemap's business, and a person reading one item
  // is not doing notemap's business.
  expect(screen.queryByText("linked")).toBeNull();
  expect(screen.queryByText("id")).toBeNull();
  expect(screen.queryByText("source")).toBeNull();
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

const ROUTED = {
  routing: {
    records: 1,
    pending: 0,
    to: [{ kind: "destination" as const, destination: "vault" }],
  },
};

const RECORD = {
  id: "rec",
  item: "routed",
  target: {
    kind: "destination",
    destination: "vault",
    capability: "create-note",
    arguments: { directory: "drafts" },
  },
  state: "delivered",
  at: "2026-08-19T22:14:00.000Z",
};

function routed(records: readonly unknown[]) {
  return (request: Request) => {
    switch (routeOf(request)) {
      case "GET /v1/items/routed":
        return json(200, anItem("routed", ROUTED));
      case "GET /v1/items/routed/routing":
        return json(200, { values: records });
      default:
        return json(200, { values: [] });
    }
  };
}

test("gives every record it draws the way into it", async () => {
  pool(routed([RECORD]));

  render(Item, { id: "routed" });

  // One line per record, which is what the opened row draws too.
  const way = await screen.findByRole("link", { name: /drafts/ });
  expect(way.getAttribute("href")).toBe("/items/routed/records/rec");
});

test("says the records are out of reach while the item still draws", async () => {
  const transport = pool(routed([RECORD]));
  await client.item("routed");
  transport.unreachable(true);

  render(Item, { id: "routed" });

  // Two answers about freshness on one surface: the item is the client's own
  // copy, and nothing caches a record at all.
  expect(await screen.findByText("from cache")).toBeDefined();
  expect(screen.getByText(NO_RECORDS_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("link", { name: /drafts/ })).toBeNull();
});

test("says the pool is out of reach once, and not in the client's own words", async () => {
  const transport = pool(routed([RECORD]));
  await client.item("routed");
  transport.unreachable(true);

  const { container } = render(Item, { id: "routed" });
  await screen.findByText(NO_RECORDS_OFFLINE);

  // The rail's sentence is the whole of what this surface has to say about it.
  // A raw client error beside the actions says the same thing twice, in words
  // chosen for a developer, from the slot an action reports through.
  expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
});

test("drops a record when the address moves to another item", async () => {
  pool((request) => {
    switch (routeOf(request)) {
      case "GET /v1/items/routed":
        return json(200, anItem("routed", ROUTED));
      case "GET /v1/items/routed/routing":
        return json(200, { values: [RECORD] });
      case "GET /v1/items/plain":
        return json(200, saying("plain", "nothing was routed"));
      default:
        return json(200, { values: [] });
    }
  });

  const { rerender } = render(Item, { id: "routed" });
  await screen.findByRole("link", { name: /drafts/ });

  await rerender({ id: "plain" });
  await screen.findByText("nothing was routed");

  // One item's history under another item's stamp, with a link proving whose
  // it was: the surface is reused across a change of address.
  await vi.waitFor(() => {
    expect(screen.queryByRole("link", { name: /drafts/ })).toBeNull();
  });
  expect(screen.getByText("unrouted")).toBeDefined();
});

/** What a gesture on this surface is answered with, so the pool is not the subject. */
/** A summary that names the person, which is what a hand-marked item carries. */
const BY_HAND = {
  routing: { records: 1, pending: 0, to: [{ kind: "user" as const }] },
};

const MARKED = {
  id: "rec-done",
  item: "one",
  at: "2026-09-04T09:00:00.000Z",
  state: "delivered",
  target: { kind: "user" },
};

function acting(item: Held) {
  return (request: Request) => {
    switch (routeOf(request)) {
      case `GET /v1/items/${item.id}`:
        return json(200, item);
      case `POST /v1/items/${item.id}/mark-processed`:
        return json(200, MARKED);
      default:
        return json(200, { values: [] });
    }
  };
}

/**
 * The rule is about the subject rather than the gesture: this surface keeps
 * what it is about, and the item under the corner is its own evidence.
 */
test("says nothing in the corner about work done to the item it is drawing", async () => {
  pool(acting(saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await done();
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });

  await fireEvent.click(screen.getByRole("button", { name: "archive" }));
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
  });

  expect(notices.shown).toHaveLength(0);
});

test("remembers the decision it stayed quiet about, so the log does not say it", async () => {
  pool(acting(saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await done();

  // The pool writes this decision to its log, which the corner reads on its
  // own tempo and would otherwise report back as news.
  await vi.waitFor(() => {
    expect(notices.said("record:rec-done")).toBe(true);
  });
});

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

/** A pool a decision can be made against: one destination, one capability. */
function deciding(held: () => unknown, records: readonly unknown[] = []) {
  return (request: Request) => {
    const route = routeOf(request);
    if (route === "GET /v1/items/one") return json(200, held());
    if (route === "GET /v1/items/one/routing") {
      return json(200, { values: records });
    }
    if (route === "GET /v1/destinations") {
      return json(200, {
        values: [
          {
            id: VAULT,
            name: "Vault",
            kind: "filesystem",
            settings: {},
            retired: false,
          },
        ],
      });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [{ name: "append", accepts: ["text"] }],
      });
    }
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        at: "2026-09-04T09:00:00.000Z",
        state: "delivered",
        pointer: "notes/inbox/one.md",
        target: {
          kind: "destination",
          destination: VAULT,
          capability: "append",
          arguments: {},
        },
      });
    }
    return json(200, { values: [] });
  };
}

/** Through the composer, as a person makes one. */
async function decide() {
  await fireEvent.click(screen.getByRole("button", { name: "route" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Vault/ }));
  await fireEvent.click(await screen.findByRole("button", { name: /append/ }));

  // Two of them: the surface's action, and the composer's commit over it.
  const commit = screen.getAllByRole("button", { name: "route" }).at(-1);
  await fireEvent.click(commit as HTMLElement);
}

test("routes from here without saying so, and remembers that decision too", async () => {
  pool(deciding(() => saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await decide();

  await vi.waitFor(() => {
    expect(notices.said("record:r")).toBe(true);
  });

  // The record is drawn where the reader already is, so the corner has nothing
  // to add — now or when the log is read back. The composer has closed, so the
  // destination named on the surface is the summary's and not the modal's.
  expect(notices.shown).toHaveLength(0);
  expect(screen.getAllByRole("button", { name: "route" })).toHaveLength(1);
  expect(screen.getByText(/Vault/)).toBeDefined();
});

/**
 * Which is what lets this surface stay quiet: the records are the pool's and
 * nothing caches them, so a decision made here is only drawn if it is read back.
 */
test("reads the records again after a decision made on this surface", async () => {
  pool(
    deciding(
      () => anItem("one", ROUTED),
      [{ ...RECORD, id: "rec-one", item: "one" }],
    ),
  );

  render(Item, { id: "one" });
  await screen.findByRole("link", { name: /drafts/ });

  const read = () =>
    asked().filter((route) => route === "GET /v1/items/one/routing").length;
  const before = read();

  await decide();

  await vi.waitFor(() => {
    expect(read()).toBe(before + 1);
  });
});

/**
 * `routing.cancel` is what makes marking done a decision rather than a fact
 * about the past, and it is the other half of not offering `done` twice.
 */
test("takes back a decision the person made by hand, and reads the records again", async () => {
  let cancelled = false;
  pool((request: Request) => {
    switch (routeOf(request)) {
      case "GET /v1/items/one":
        return json(200, saying("one", "still here", BY_HAND));
      case "GET /v1/items/one/routing":
        return json(200, { values: cancelled ? [] : [MARKED] });
      case "POST /v1/routing/rec-done/cancel":
        cancelled = true;
        return json(204, undefined);
      default:
        return json(200, { values: [] });
    }
  });

  render(Item, { id: "one" });
  const way = await screen.findByRole("button", { name: "undo" });

  await fireEvent.click(way);

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/routing/rec-done/cancel");
  });
  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "undo" })).toBeNull();
  });
});

/** A delivery is the pool's; only what the person did by hand is theirs to undo. */
test("offers no undo on a record the pool delivered", async () => {
  pool(routed([RECORD]));

  render(Item, { id: "routed" });
  await screen.findByRole("link", { name: /drafts/ });

  expect(screen.queryByRole("button", { name: "undo" })).toBeNull();
});
