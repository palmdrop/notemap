import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import { NO_RECORDS_OFFLINE } from "$lib/said";
import { dayOf } from "$lib/stamp";
import Record from "./Record.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

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

/** The item's register with one record row: the capture, the rule, the block. */
test("draws the capture and the one record under it", async () => {
  pool(
    answering([RECORD, { ...RECORD, id: "rec-2", pointer: "drafts/two.md" }]),
  );
  await client.destinations.load();

  const { container } = render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText("Fiction vault")).toBeDefined();
  expect(screen.getByText("drafts/note.md")).toBeDefined();
  expect(screen.queryByText("drafts/two.md")).toBeNull();
  expect(screen.getByText(dayOf(RECORD.at))).toBeDefined();
  expect(screen.getByText("delivered")).toBeDefined();
  expect(container.querySelectorAll(".border-t.col-span-full")).toHaveLength(1);

  // The address bar already says which record this is: the stamp goes nowhere.
  expect(screen.getByText(dayOf(RECORD.at)).closest("a")).toBeNull();
  expect(screen.queryByText("rec")).toBeNull();
  expect(screen.queryByText("routing record")).toBeNull();
});

test("says a record this item does not have", async () => {
  pool(answering([]));

  render(Record, { item: "one", record: "rec" });

  expect(await screen.findByText(/No such record/)).toBeDefined();
  expect(screen.getByText("gone")).toBeDefined();
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
  expect(screen.getByRole("button", { name: "process" })).toBeDefined();
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
