import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "../../testing/pool";
import { remember } from "$lib/order";
import Feed from "./Feed.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

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

/**
 * Two claims about two subjects: what became of the item in the pool, and what
 * this client has not sent yet. A row can carry both at once.
 */
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
