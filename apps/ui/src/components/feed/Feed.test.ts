import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { online } from "$testing/dom";
import { remember } from "$lib/order";
import { rail } from "$lib/rail.svelte";
import { NO_MORE_OFFLINE, NOTHING_CAPTURED } from "$lib/said";
import Feed from "./Feed.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

// Module-scoped reading preference, so a test that furls the rail unfurls it.
afterEach(() => {
  if (rail.furled) rail.toggle();
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

test("says an archived row is archived, and offers the way back", async () => {
  pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);

  expect(await screen.findByText("archived")).toBeDefined();

  await fireEvent.click(screen.getByRole("button", { name: "unarchive" }));

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
  await screen.findByText("archived");

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);

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

  await fireEvent.click(
    screen.getAllByRole("button", { name: "Add a tag" })[0]!,
  );
  const field = screen.getByRole("combobox", { name: "Add a tag" });
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });

  await fireEvent.click(
    screen.getAllByRole("button", { name: "Add a tag" })[1]!,
  );

  await vi.waitFor(() => {
    const opened = screen.getByRole("combobox", {
      name: "Add a tag",
    }) as HTMLInputElement;
    const list = document.getElementById(opened.getAttribute("list") ?? "");
    expect(
      [...(list?.children ?? [])].map((one) => one.getAttribute("value")),
    ).toEqual(["reading"]);
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

  expect(await screen.findByText("routed")).toBeDefined();
  expect(
    await screen.findByText("Fiction, marked done · 1 pending"),
  ).toBeDefined();
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

test("says an archived row is archived and still pending", async () => {
  const transport = pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);
  await screen.findByText("archived");
  transport.unreachable(true);

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);

  expect(await screen.findByText("pending")).toBeDefined();
  expect(screen.getByText("archived")).toBeDefined();
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

test("keeps the row's marks when the rail furls, and draws each of them once", async () => {
  const transport = pool(
    held(
      anItem("gone", { archived: { archivedAt: "2026-08-17T07:15:00.000Z" } }),
    ),
  );

  render(Feed);
  await screen.findByText("archived");
  transport.unreachable(true);

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "reading" } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);
  await screen.findByText("pending");

  rail.toggle();
  await vi.waitFor(() => {
    expect(screen.getAllByText("archived")).toHaveLength(1);
  });
  expect(screen.getAllByText("pending")).toHaveLength(1);
});
