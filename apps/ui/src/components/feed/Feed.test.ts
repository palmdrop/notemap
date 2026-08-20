import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "../../testing/pool";
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

test("says where a routed row went, without asking for its records", async () => {
  const app = await import("../../testing/pool");
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
  await app.client.destinations.load();
  render(Feed);

  expect(await screen.findByText("routed")).toBeDefined();
  expect(
    await screen.findByText("Fiction, marked done · 1 pending"),
  ).toBeDefined();
  expect(asked()).not.toContain("GET /v1/items/sent/routing");
});

test("names a destination it has not read by its id", async () => {
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

  expect(await screen.findByText("vault-1")).toBeDefined();
});

test("marks a revision as one without opening it", async () => {
  pool(held(anItem("later", { revisionOf: "earlier" })));

  render(Feed);

  expect(await screen.findByText("revision")).toBeDefined();
});
