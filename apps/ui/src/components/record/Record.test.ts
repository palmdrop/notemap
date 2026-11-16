import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { NO_RECORDS_OFFLINE } from "$lib/said";
import { dayOf } from "$lib/stamp";
import Record from "./Record.svelte";

const RECORD = {
  id: "rec",
  item: "one",
  target: {
    kind: "destination",
    destination: "vault",
    capability: "create",
    arguments: { directory: "drafts", filename: "note.md" },
  },
  state: "delivered",
  at: "2026-08-19T22:14:00.000Z",
  pointer: "drafts/note.md",
};

const VAULT = {
  id: "vault",
  name: "Fiction vault",
  kind: "filesystem",
  settings: {},
  retired: false,
};

/** The pool answers the item, its records and the destinations behind them. */
function answering(records: readonly unknown[] = [RECORD]) {
  return (request: Request) => {
    switch (routeOf(request)) {
      case "GET /v1/items/one":
        return json(
          200,
          anItem("one", {
            routing: {
              records: records.length,
              pending: 0,
              to: [],
              templates: [],
            },
          }),
        );
      case "GET /v1/items/one/routing":
        return json(200, { values: records });
      case "GET /v1/destinations":
        return json(200, { values: [VAULT] });
      case "GET /v1/routing/rec/output":
      case "GET /v1/routing/rec-2/output":
        return new Response(`# ${routeOf(request).split("/")[3]}\n`, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      default:
        return json(200, { values: [] });
    }
  };
}

/** The item's register with one record row: the capture's box, then the block. */
test("draws the capture and the one record under it", async () => {
  pool(
    answering([RECORD, { ...RECORD, id: "rec-2", pointer: "drafts/two.md" }]),
  );
  await client.destinations.load();

  const { container } = render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("Fiction vault")).toBeDefined();
  expect(await screen.findByText("drafts/note.md")).toBeDefined();
  expect(screen.queryByText("drafts/two.md")).toBeNull();
  expect(screen.getByText(dayOf(RECORD.at), { exact: false })).toBeDefined();
  expect(screen.getByRole("status").textContent).toContain(
    "Delivered to Fiction vault.",
  );
  expect(container.querySelector("[role=toolbar]")).not.toBeNull();
  expect(screen.queryByText("rec")).toBeNull();
  expect(screen.queryByText("routing record")).toBeNull();
});

test("withdraw has a band of its own, under what was written", async () => {
  pool(answering());
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("withdraw")).toBeDefined();
  expect(
    screen.getByRole("button", { name: /Withdraw this record/ }),
  ).toBeDefined();
});

test("a delivery with an address opens there, and one without copies its path", async () => {
  pool(answering([{ ...RECORD, url: "https://example.org/note" }]));
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(
    (
      await screen.findByRole("link", { name: "Open in Fiction vault" })
    ).getAttribute("href"),
  ).toBe("https://example.org/note");
  expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
});

test("a delivery cancelled in its window is the log's account, titled tried", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/actions") {
      return json(200, {
        values: [
          {
            id: "a1",
            at: "2026-08-19T22:14:00.000Z",
            kind: "template-fired",
            subject: "one",
            detail: {
              record: "rec",
              destination: "vault",
              capability: "create",
            },
          },
          {
            id: "a2",
            at: "2026-08-19T22:14:05.000Z",
            kind: "delivery-cancelled",
            subject: "one",
            detail: {
              record: "rec",
              destination: "vault",
              capability: "create",
            },
          },
        ],
      });
    }
    return answering([])(request);
  });
  await client.destinations.load();

  render(Record, { item: "one", record: "rec" });

  expect(
    await screen.findByText("Cancelled. Nothing reached Fiction vault."),
  ).toBeDefined();
  expect(screen.getByText("new note")).toBeDefined();
});

test("says a record this item does not have", async () => {
  pool(answering([]));

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(/No such record/)).toBeDefined();
});

test("says a record an unrouted item cannot have", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/items/one"
      ? json(200, anItem("one"))
      : json(200, { values: [] }),
  );

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(/No such record/)).toBeDefined();
  expect(asked()).toContain("GET /v1/items/one/routing");
});

test("says records are out of reach while the item still draws", async () => {
  const transport = pool(answering());
  await client.item("one");
  transport.unreachable(true);

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(NO_RECORDS_OFFLINE)).toBeDefined();
  expect(screen.getByRole("link", { name: "Item" })).toBeDefined();
});

test("drops what one record sent when another is drawn", async () => {
  const both = [RECORD, { ...RECORD, id: "rec-2" }].map((record) => ({
    ...record,
    output: { content: { blob: "abc", mediaType: "text/markdown" } },
  }));
  pool(answering(both));
  await client.destinations.load();

  const drawn = render(Record, { item: "one", record: "rec" });
  expect(await screen.findByText("# rec")).toBeDefined();

  // The page component is reused across a change of record.
  await drawn.rerender({ item: "one", record: "rec-2" });

  expect(await screen.findByText("# rec-2")).toBeDefined();
  expect(screen.queryByText("# rec")).toBeNull();
});

test("a record's bar leads to its item, offers a route made by hand as a template, and copies a path where there is one", async () => {
  pool(answering());
  await client.item("one");

  render(Record, { item: "one", record: "rec" });

  expect(
    (await screen.findByRole("link", { name: "Item" })).getAttribute("href"),
  ).toBe("/items/one");
  expect(
    await screen.findByRole("link", { name: "Save as template" }),
  ).toBeDefined();
});
