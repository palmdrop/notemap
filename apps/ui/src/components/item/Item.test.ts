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

/** Leaving the surface needs a router, and there is none outside the app. */
const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
}));

/** Both act when taken, from the item's own actions: no second step and no commit. */
async function manual() {
  await fireEvent.click(screen.getByRole("button", { name: "manual" }));
}

async function discard() {
  await fireEvent.click(screen.getByRole("button", { name: "discard" }));
}

afterEach(() => {
  notices.clear();
  went.to = [];
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
  // Arriving reads the queue again, membership being the one thing a visit
  // elsewhere can cost it — and reads it from the end the reader chose.
  expect(
    transport.sent
      .filter((request) => routeOf(request) === "GET /v1/queue")
      .map((request) => new URL(request.url).searchParams.get("order")),
  ).toEqual(["newest-first", "newest-first"]);
});

const ROUTED = {
  routing: {
    records: 1,
    pending: 0,
    to: [{ kind: "destination" as const, destination: "vault" }],
    templates: [],
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

/**
 * A row is the shortest reading of where a capture went, so it is the last
 * place an id nobody can read belongs. Asked once and kept.
 */
test("names the channel a row's routing line went to", async () => {
  const CHANNEL_RECORD = {
    ...RECORD,
    target: {
      kind: "destination",
      destination: "vault",
      capability: "publish",
      arguments: { channel: "12345" },
    },
  };

  pool((request) => {
    const route = routeOf(request);
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [
          {
            name: "publish",
            accepts: ["text"],
            argumentsSchema: {
              type: "object",
              properties: {
                channel: {
                  type: "string",
                  "x-notemap-candidates": true,
                  "x-notemap-offered-only": true,
                },
              },
            },
          },
        ],
      });
    }
    if (route.endsWith("/candidates")) {
      return json(200, {
        kind: "answered",
        entries: [{ label: "Reading", value: "reading", durable: "12345" }],
        truncated: false,
      });
    }
    return routed([CHANNEL_RECORD])(request);
  });

  render(Item, { id: "routed" });

  expect(await screen.findByText("Reading")).toBeDefined();
  expect(screen.queryByText(/12345/)).toBeNull();
});

/** The capture, a rule, then each record as a row: its stamp is the way into it. */
test("draws each record as a row under a rule, with the way into it", async () => {
  pool(routed([RECORD, { ...RECORD, id: "rec-2", pointer: "drafts/two.md" }]));

  const { container } = render(Item, { id: "routed" });

  await screen.findByText("drafts/two.md");
  expect(screen.getByText("drafts")).toBeDefined();
  expect(container.querySelectorAll(".border-t.col-span-full")).toHaveLength(1);

  const ways = screen
    .getAllByRole("link")
    .map((way) => way.getAttribute("href"))
    .filter((href) => href?.startsWith("/items/routed/records/"));
  expect(ways).toEqual([
    "/items/routed/records/rec",
    "/items/routed/records/rec-2",
  ]);
  // Delivered is said on a row of its own.
  expect(screen.getAllByText("delivered")).toHaveLength(2);
});

test("draws no rule under an item nothing became of", async () => {
  pool(holding(saying("plain", "nothing was routed")));

  const { container } = render(Item, { id: "plain" });

  await screen.findByText("nothing was routed");
  expect(container.querySelector(".border-t.col-span-full")).toBeNull();
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
  expect(screen.queryByText("drafts")).toBeNull();
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
  await screen.findByText("drafts");

  await rerender({ id: "plain" });
  await screen.findByText("nothing was routed");

  // One item's records under another item's stamp: the surface is reused
  // across a change of address.
  await vi.waitFor(() => {
    expect(screen.queryByText("drafts")).toBeNull();
  });
  // Nothing routed is nothing said: the absence of a line is the word.
  expect(screen.queryByText("unrouted")).toBeNull();
});

/** A summary that names the person, which is what a hand-marked item carries. */
const BY_HAND = {
  routing: {
    records: 1,
    pending: 0,
    to: [{ kind: "user" as const }],
    templates: [],
  },
};

/** What a gesture on this surface is answered with, so the pool is not the subject. */
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
 * A quick decision says so in the corner wherever it is taken, because that is
 * where its undo lives; what this surface stays quiet about is a routing, the
 * item under the corner being its own evidence of one.
 */
test("says only what offers a way back in the corner about the item it is drawing", async () => {
  pool(acting(saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await manual();
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });

  await discard();
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/archive");
  });

  await vi.waitFor(() => {
    expect(notices.shown.map((notice) => notice.what).sort()).toEqual([
      "discarded",
      "marked manual",
    ]);
  });
  expect(notices.shown.every((notice) => notice.offer?.label === "undo")).toBe(
    true,
  );
});

test("remembers the decision it stayed quiet about, so the log does not say it", async () => {
  pool(acting(saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await manual();

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

test("process goes to the surface for it", async () => {
  pool(deciding(() => saying("one", "still here")));

  render(Item, { id: "one" });
  await screen.findByText("still here");

  await fireEvent.click(screen.getByRole("button", { name: "process" }));

  expect(went.to).toEqual(["/items/one/process"]);
});

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
  await screen.findByText("drafts");

  expect(screen.queryByRole("button", { name: "undo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "cancel" })).toBeNull();
});
