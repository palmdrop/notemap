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

test("marks a revision as one without opening it", async () => {
  pool(held(anItem("later", { revisionOf: "earlier" })));

  render(Feed);

  expect(await screen.findByText("revision")).toBeDefined();
});
