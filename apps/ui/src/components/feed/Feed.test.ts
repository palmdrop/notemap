import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { keyboard, online } from "$testing/dom";
import { remember } from "$lib/order";
import { NO_MORE_OFFLINE, NOTHING_CAPTURED } from "$lib/said";
import Feed from "./Feed.svelte";

keyboard();

vi.mock("$lib/client", () => import("$testing/pool"));

/** Leaving the surface needs a router, and there is none outside the app. */
const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
  replaceState: () => undefined,
}));

vi.mock("$app/state", () => ({
  page: { url: new URL("http://localhost/feed"), route: { id: "/feed" } },
}));

/** A row is selected on its own stamp, which is the row's title. */
function open(at = 0) {
  return fireEvent.click(stamps(false)[at]!);
}

/** The rows' own buttons: the order chooser answers `expanded` too. */
function stamps(expanded: boolean) {
  return screen.queryAllByRole("button", {
    expanded,
    name: /^\d{4}-\d{2}-\d{2}/,
  });
}

afterEach(() => {
  went.to = [];
  localStorage.clear();
});

function held(...values: Record<string, unknown>[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/feed"
      ? json(200, { values })
      : json(200, { values: [] });
}

test("draws what the pool holds", async () => {
  pool(held(anItem("one"), anItem("two")));

  render(Feed);

  expect(await screen.findByText("one")).toBeDefined();
  expect(await screen.findByText("two")).toBeDefined();
});

test("says an archived row is discarded, and offers the way back", async () => {
  pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);

  expect(await screen.findByText("discarded")).toBeDefined();
  await open();

  await fireEvent.click(screen.getByRole("button", { name: "undiscard" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/gone/unarchive");
  });
});

test("keeps tags editable on a finished row", async () => {
  pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);
  await screen.findByText("discarded");
  await open();

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/gone/tag");
  });
});

/**
 * The set is the pool's, not the row's, so a tag added on one row has to reach
 * the field on every other one — which is the whole reason it is read again
 * once classification drains.
 */
test("offers a tag added on one row in the field on another", async () => {
  let tagged = false;
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/feed") {
      return json(200, { values: [anItem("one"), anItem("two")] });
    }
    if (route === "GET /v1/tags") {
      return json(200, {
        values: tagged ? [{ name: "reading", items: 1 }] : [],
      });
    }
    if (route === "POST /v1/items/one/tag") {
      tagged = true;
      return json(200, anItem("one"));
    }
    return json(200, { values: [] });
  });

  await client.tags.load();
  render(Feed);
  await screen.findByText("one");

  await open(0);
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByRole("combobox", { name: "Add a tag" });
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });

  // The other row, which selecting is what puts the `+` on.
  await open(0);
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));

  await vi.waitFor(() => {
    expect(screen.getByRole("option", { name: "reading" })).toBeDefined();
  });
});

test("says where a routed row went, without asking for its records", async () => {
  pool((request) => {
    if (routeOf(request) === "GET /v1/feed") {
      return json(200, {
        values: [
          anItem("sent", {
            routing: {
              records: 2,
              pending: 1,
              to: [
                { kind: "destination", destination: "vault-1" },
                { kind: "user" },
              ],
              templates: [],
            },
          }),
        ],
      });
    }
    if (routeOf(request) === "GET /v1/destinations") {
      return json(200, {
        values: [
          {
            id: "vault-1",
            name: "Fiction",
            kind: "filesystem",
            settings: {},
            retired: false,
          },
        ],
      });
    }
    return json(200, { values: [] });
  });

  // The layout reads the destinations once, and every surface names them from it.
  await client.destinations.load();
  render(Feed);

  // One of the two records has not been carried out: the line says so, and
  // no word over it repeats what the line says.
  expect(await screen.findByText("Fiction, manual · 1 pending")).toBeDefined();
  expect(screen.queryByText("retrying")).toBeNull();
  expect(screen.queryByText("routed")).toBeNull();
  expect(asked()).not.toContain("GET /v1/items/sent/routing");
});

test("says a destination it has not read is one, rather than saying its id", async () => {
  pool(
    held(
      anItem("sent", {
        routing: {
          records: 1,
          pending: 0,
          to: [{ kind: "destination", destination: "vault-1" }],
          templates: [],
        },
      }),
    ),
  );

  render(Feed);

  expect(await screen.findByText("a destination")).toBeDefined();
});

test("marks a revision as one without opening it", async () => {
  pool(held(anItem("later", { revisionOf: "earlier" })));

  render(Feed);

  expect(await screen.findByText("revision")).toBeDefined();
});

test("reads from the end the reader last chose, not the one the feed defaults to", async () => {
  remember("feed", "oldest-first");
  const transport = pool(held(anItem("one")));

  render(Feed);
  await screen.findByText("one");

  const read = transport.sent.find(
    (request) => routeOf(request) === "GET /v1/feed",
  );
  expect(new URL(read!.url).searchParams.get("order")).toBe("oldest-first");
});

test("says an archived row is discarded and still pending", async () => {
  const transport = pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);
  await screen.findByText("discarded");
  transport.unreachable(true);
  await open();

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  expect(await screen.findByText("pending")).toBeDefined();
  expect(screen.getByText("discarded")).toBeDefined();
});

test("says nothing in the register about a feed the pool has not answered for", async () => {
  const transport = pool(held(anItem("one")));
  transport.unreachable(true);

  render(Feed);
  await screen.findByText(NO_MORE_OFFLINE);

  // The chrome carries the offline mark, the foot says what it costs; the
  // register repeats neither that nor what the surface is drawn from.
  expect(screen.queryByText("feed")).toBeNull();
  expect(screen.queryByText("the daemon is not reachable")).toBeNull();
  expect(screen.queryByText(NOTHING_CAPTURED)).toBeNull();
});

test("offers no page it cannot fetch while the pool is out of reach", async () => {
  const transport = pool(held(anItem("one")));

  render(Feed);
  expect(
    await screen.findByRole("button", { name: "load more" }),
  ).toBeDefined();

  transport.unreachable(true);
  await client.loadFeed();

  expect(await screen.findByText(NO_MORE_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("button", { name: "load more" })).toBeNull();
});

test("says nothing in the foot of a feed read to the end", async () => {
  pool(held(anItem("one")));

  render(Feed);
  await screen.findByText("one");
  expect(screen.queryByRole("button", { name: "load more" })).toBeNull();

  // There is no next page to be denied, so being out of reach costs nothing.
  online(false);
  await tick();
  expect(screen.queryByText(NO_MORE_OFFLINE)).toBeNull();
});

test("draws the read the pool refused", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/feed"
      ? json(400, { error: { code: "bad-position" } })
      : json(200, { values: [] }),
  );

  render(Feed);

  expect(
    await screen.findByText("the app lost its place in the list; reload"),
  ).toBeDefined();
  expect(screen.getAllByText("feed")).toHaveLength(1);
});

test("says nothing was captured only once the pool has answered for the feed", async () => {
  const transport = pool(held());
  transport.unreachable(true);

  render(Feed);
  await vi.waitFor(() => {
    expect(asked()).toContain("GET /v1/feed");
  });
  expect(screen.queryByText(NOTHING_CAPTURED)).toBeNull();

  transport.unreachable(false);
  await client.loadFeed();

  expect(await screen.findByText(NOTHING_CAPTURED)).toBeDefined();
});

test("opens a row in place, with what the queue's row offers", async () => {
  pool(held(anItem("one")));

  render(Feed);
  await screen.findByText("one");
  await open();

  expect(screen.getByRole("button", { name: "process" })).toBeDefined();
  expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
    "/items/one",
  );
});

test("reads a row's records only once it is opened", async () => {
  pool((request) => {
    if (routeOf(request) === "GET /v1/feed") {
      return json(200, {
        values: [
          anItem("sent", {
            routing: {
              records: 1,
              pending: 0,
              to: [{ kind: "destination", destination: "vault-1" }],
              templates: [],
            },
          }),
        ],
      });
    }
    if (routeOf(request) === "GET /v1/items/sent/routing") {
      return json(200, {
        values: [
          {
            id: "record-1",
            item: "sent",
            target: {
              kind: "destination",
              destination: "vault-1",
              capability: "create",
              arguments: {},
            },
            state: "delivered",
            at: "2026-08-17T07:15:00.000Z",
            pointer: "notes/decisions.md",
          },
        ],
      });
    }
    return json(200, { values: [] });
  });

  render(Feed);
  await screen.findByText("sent");
  expect(asked()).not.toContain("GET /v1/items/sent/routing");

  await open();

  await vi.waitFor(() => {
    expect(asked()).toContain("GET /v1/items/sent/routing");
  });
  const line = await screen.findByRole("link", {
    name: /vault-1|a destination/,
  });
  expect(line.getAttribute("href")).toBe("/items/sent/records/record-1");
});

/**
 * A trigger tag whose template's record still stands cannot be taken off from
 * a row either, since the pool would refuse it — so the row draws it inert
 * rather than as a control that presses into a refusal.
 */
test("draws a trigger tag that filed the item as inert on the row", async () => {
  const RESEARCH = {
    id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80",
    name: "research",
    destination: "vault-1",
    capability: "create",
    arguments: {},
    triggerTag: "route/research",
  };
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/feed") {
      return json(200, {
        values: [
          anItem("sent", {
            tags: [
              {
                name: "route/research",
                by: { kind: "person" },
                addedAt: "2026-08-17T10:00:00.000Z",
              },
            ],
            routing: {
              records: 1,
              pending: 0,
              to: [{ kind: "destination", destination: "vault-1" }],
              templates: [RESEARCH.id],
            },
          }),
        ],
      });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: [RESEARCH] });
    }
    return json(200, { values: [] });
  });
  await client.templates.load();

  render(Feed);
  await screen.findByText("sent");
  await open();

  const tag = screen.getByText("research");
  expect(tag.tagName).toBe("SPAN");
  expect(screen.queryByRole("button", { name: /research/ })).toBeNull();
});

test("goes to process on a double click, and leaves the row selected", async () => {
  pool(held(anItem("one")));

  render(Feed);
  const body = await screen.findByText("one");

  await fireEvent.click(body, { detail: 1 });
  await fireEvent.click(body, { detail: 2 });
  await fireEvent.dblClick(body);

  expect(went.to).toEqual(["/items/one/process"]);
  // The second click of a double is not a toggle: select, nothing, go.
  expect(stamps(true)).toHaveLength(1);
});

test("puts the view back where the reader left it to read one item", async () => {
  pool(held(anItem("one")));

  render(Feed);
  await screen.findByText("one");
  Object.defineProperty(window, "scrollY", { configurable: true, value: 320 });
  await fireEvent.scroll(window);

  cleanup();
  render(Feed);

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 320 });
  });
});

test("walks the rows with j and k, and processes the one selected", async () => {
  pool(held(anItem("one"), anItem("two")));

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "j" });
  expect(stamps(true)).toHaveLength(1);

  await fireEvent.keyDown(window, { key: "k" });
  await fireEvent.keyDown(window, { key: "p" });
  expect(went.to).toEqual(["/items/one/process"]);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(stamps(true)).toHaveLength(0);
});

test("j past the last row held reads the next page and steps into it", async () => {
  pool((request) => {
    if (routeOf(request) !== "GET /v1/feed") return json(200, { values: [] });
    return new URL(request.url).searchParams.has("after")
      ? json(200, { values: [anItem("two")] })
      : json(200, { values: [anItem("one")], next: "/v1/feed?after=one" });
  });

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "j" });
  await screen.findByText("two");

  // The step lands once the page has; `p` takes whichever row is selected.
  await vi.waitFor(async () => {
    went.to = [];
    await fireEvent.keyDown(window, { key: "p" });
    expect(went.to).toEqual(["/items/two/process"]);
  });
});

/** A second page whose answer waits until the test lets it go. */
function paged() {
  let answer: () => void = () => {};
  const gate = new Promise<void>((done) => (answer = done));

  pool(async (request) => {
    if (routeOf(request) !== "GET /v1/feed") return json(200, { values: [] });
    if (!new URL(request.url).searchParams.has("after")) {
      return json(200, { values: [anItem("one")], next: "/v1/feed?after=one" });
    }
    await gate;
    return json(200, { values: [anItem("two")] });
  });

  return () => answer();
}

test("j past the last row while its next page is read steps once it lands", async () => {
  const answer = paged();

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  // Scrolling got there first.
  const reading = client.loadFeed();
  await fireEvent.keyDown(window, { key: "j" });

  answer();
  await reading;
  await screen.findByText("two");

  await vi.waitFor(async () => {
    went.to = [];
    await fireEvent.keyDown(window, { key: "p" });
    expect(went.to).toEqual(["/items/two/process"]);
  });
});

test("letting go while the next page is read does not select anything", async () => {
  const answer = paged();

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  const reading = client.loadFeed();
  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "Escape" });

  answer();
  await reading;
  await screen.findByText("two");
  await tick();

  expect(stamps(true)).toHaveLength(0);
});

test("t opens the tag chooser on the selected row", async () => {
  pool(held(anItem("one")));

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await fireEvent.keyDown(window, { key: "t" });

  expect(await screen.findByLabelText("Add a tag")).toBeTruthy();
});
