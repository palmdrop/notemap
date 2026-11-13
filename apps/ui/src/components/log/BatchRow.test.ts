import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { Action } from "@notemap/client";
import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool, sentUrls } from "$testing/pool";
import { log } from "$lib/log.svelte";
import Log from "./Log.svelte";

afterEach(() => {
  log.forget();
});

type Row = Record<string, unknown>;

const TAG = "reading";

function anAction(id: string, overrides: Row = {}): Row {
  return {
    id,
    kind: "tagged",
    subject: `item-${id}`,
    by: { kind: "person" },
    at: "2026-11-12T10:00:00.000Z",
    detail: { tag: TAG },
    ...overrides,
  };
}

/** The walk answers `rows`; a read by batch answers what that batch wrote. */
function logged(rows: Row[], batches: Record<string, Row[]> = {}) {
  return (request: Request) => {
    const route = routeOf(request);
    if (route === "GET /v1/items") return json(200, { values: [] });
    if (route !== "GET /v1/actions") return json(200, { values: [] });
    const batch = new URL(request.url).searchParams.get("batch");
    return json(200, {
      values: batch === null ? rows : (batches[batch] ?? []),
    });
  };
}

test("draws a batch as one row, counted as its notice counts it, and asks for the rest of it", async () => {
  const b1 = [
    anAction("a1", { batch: "b1", subject: "item-1" }),
    anAction("a2", { batch: "b1", subject: "item-2" }),
    anAction("a3", { batch: "b1", subject: "item-3" }),
  ];
  pool(logged([b1[0]!, anAction("loose"), b1[1]!], { b1 }));
  render(Log);
  log.reading("newest-first", undefined);

  const count = await screen.findByRole("button", {
    name: /3 notes tagged reading/,
  });
  expect(count.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getAllByText("batch")).toHaveLength(1);
  expect(screen.getAllByText("tagged")).toHaveLength(1);
  expect(sentUrls().some((url) => url.includes("batch=b1"))).toBe(true);
  expect(document.body.textContent).not.toContain("·");
});

test("opens to every entry the batch wrote, the walk's and the rest", async () => {
  const b1 = [
    anAction("a1", { batch: "b1", subject: "item-1" }),
    anAction("a2", { batch: "b1", subject: "item-2" }),
  ];
  pool(logged([b1[0]!], { b1 }));
  render(Log);
  log.reading("newest-first", undefined);

  const count = await screen.findByRole("button", {
    name: /2 notes tagged/,
  });
  await fireEvent.click(count);

  const row = count.closest<HTMLElement>("[data-batch]")!;
  await vi.waitFor(() => {
    expect(within(row).getAllByRole("listitem")).toHaveLength(2);
  });
  expect(within(row).getAllByText("tagged")).toHaveLength(2);
  expect(screen.getAllByText("tagged")).toHaveLength(2);
});

test("draws a batch's entries as they are where the log is narrowed to an item", async () => {
  const b1 = [
    anAction("a1", { batch: "b1", subject: "item-1" }),
    anAction("a2", { batch: "b1", subject: "item-1", kind: "archived" }),
  ];
  pool(logged(b1, { b1 }));
  render(Log);
  log.reading("newest-first", "item-1");

  expect(await screen.findByText("tagged")).toBeDefined();
  expect(screen.getByText("discarded")).toBeDefined();
  expect(screen.queryByText("batch")).toBeNull();
});

test("joins what arrives to the batch it belongs to", async () => {
  const b1 = [anAction("a1", { batch: "b1", subject: "item-1" })];
  pool(logged(b1, { b1 }));
  render(Log);
  log.reading("newest-first", undefined);
  await screen.findByRole("button", { name: /1 note tagged/ });

  log.arrived([
    anAction("a2", {
      batch: "b1",
      subject: "item-2",
      at: "2026-11-12T10:05:00.000Z",
    }) as unknown as Action,
  ]);

  expect(
    await screen.findByRole("button", { name: /2 notes tagged/ }),
  ).toBeDefined();
  expect(screen.getAllByText("batch")).toHaveLength(1);
});

test("reads one batch with what this client was told of the items it refused and skipped", async () => {
  pool(async (request) => {
    const route = routeOf(request);
    if (route === "POST /v1/batches") {
      return json(200, {
        batch: "ignored",
        values: [
          { id: "one", outcome: "tagged", item: anItem("one") },
          { id: "two", outcome: "skipped", item: anItem("two") },
          { id: "three", outcome: "refused", error: { code: "no-such-item" } },
        ],
      });
    }
    if (route === "GET /v1/actions") {
      return json(200, {
        values: [anAction("a1", { subject: "one" })],
      });
    }
    return json(200, { values: [] });
  });
  const id = await client.batch(["one", "two", "three"], {
    kind: "tag",
    tag: TAG,
  });
  await client.drain();

  render(Log);
  log.reading("newest-first", undefined, undefined, id);

  const head = await screen.findByText(/1 note tagged/);
  expect(head.closest("p")?.textContent).toContain(
    "1 already tagged, 1 refused",
  );
  expect(
    within(head.closest("p")!).getByRole("link", { name: "all of the log" }),
  ).toBeDefined();
  expect(screen.getByText("refused")).toBeDefined();
  expect(screen.getByText("no-such-item")).toBeDefined();
  expect(screen.getByText("skipped")).toBeDefined();
  expect(document.body.textContent).not.toContain("·");
});

test("says what the log holds of a batch that changed nothing, rather than asking forever", async () => {
  const b1 = [
    anAction("a1", {
      batch: "b1",
      kind: "routed",
      detail: { record: "r1" },
    }),
  ];
  pool(logged(b1, { b1 }));
  render(Log);
  log.reading("newest-first", undefined, undefined, "b1");

  const head = await screen.findByText(/1 routed/);
  expect(head.closest("p")?.querySelector("[role=status]")).toBeNull();
});

test("stops asking over a batch the pool has no entry for", async () => {
  pool(logged([]));
  render(Log);
  log.reading("newest-first", undefined, undefined, "nowhere");

  await vi.waitFor(() => expect(log.loading).toBe(false));
  const head = screen.getByText("all of the log").closest("p")!;
  await vi.waitFor(() =>
    expect(head.querySelector("[role=status]")).toBeNull(),
  );
});

test("says a batch it could not read whole was not all read", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route !== "GET /v1/actions") return json(200, { values: [] });
    return new URL(request.url).searchParams.has("batch")
      ? json(422, { error: { code: "bad-position" } })
      : json(200, { values: [anAction("a1", { batch: "b1" })] });
  });
  render(Log);
  log.reading("newest-first", undefined);

  expect(await screen.findByText("not all of it read")).toBeDefined();
  expect(
    screen.getByRole("button", { name: /1 note tagged reading/ }),
  ).toBeDefined();
});
