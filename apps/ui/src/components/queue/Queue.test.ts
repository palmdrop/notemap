import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "../../testing/pool";
import { briefly } from "$lib/stamp";
import { online } from "../../testing/dom";
import { rail } from "$lib/rail.svelte";
import { remember } from "$lib/order";
import Queue from "./Queue.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

// Module-scoped reading preference, so a test that furls the rail unfurls it.
afterEach(() => {
  if (rail.furled) rail.toggle();
});

function queued(...ids: string[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: ids.map((id) => anItem(id)) })
      : json(200, { values: [] });
}

/** A row opens on its own stamp, which is the row's title. */
function open(at: number) {
  return fireEvent.click(
    screen.getAllByRole("button", { expanded: false })[at],
  );
}

/** Where the person had scrolled, as the browser would report it. */
function scrolledTo(at: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: at });
  return fireEvent.scroll(window);
}

test("puts the view back where the person left it, without asking the pool", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await scrolledTo(240);

  cleanup();
  render(Queue);

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 });
  });
  expect(asked()).toEqual(["GET /v1/queue"]);
});

test("archives with the pool unreachable, and disables what it cannot queue", async () => {
  const transport = pool(queued("one"));
  online(false);

  render(Queue);
  await screen.findByText("one");
  transport.unreachable(true);

  // Processing happens in the row, so the actions are behind opening it.
  await fireEvent.click(screen.getByRole("button", { expanded: false }));

  const disabled = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  expect(disabled("mark done")).toBe(true);
  expect(disabled("route")).toBe(true);
  expect(disabled("archive")).toBe(false);

  await fireEvent.click(screen.getByRole("button", { name: "archive" }));

  // The pool never answered it, and the item left the queue all the same.
  await screen.findByText("zero");
  expect(asked()).toContain("POST /v1/items/one/archive");
});

test("opens one row at a time, in place", async () => {
  pool(queued("one", "two"));

  render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);

  await open(0);

  // The second row's stamp, the first one now being expanded.
  const stamps = screen.getAllByRole("button", { expanded: true });
  expect(stamps).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
});

/** The queue holds unrouted items, so opening one has nothing to ask about. */
test("opens a row without asking where an item has never been", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  // The rail says so collapsed, which is what makes the read unnecessary.
  expect(screen.getByText("unrouted")).toBeDefined();

  await open(0);

  expect(await screen.findByText("payload")).toBeDefined();
  expect(asked()).not.toContain("GET /v1/items/one/routing");
});

test("draws the way to add to the queue even when the queue is empty", async () => {
  pool(queued());

  render(Queue);

  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByLabelText("What to capture")).toBeDefined();
});

test("reads the drained queue as the thing it was working toward", async () => {
  pool(queued());

  render(Queue);

  // The state word idiom, which is what the register says became of a thing.
  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByText(/The queue is empty/)).toBeDefined();
  expect(screen.queryByText(/Empty —/)).toBeNull();
});

test("offers the edit on an unprocessed row and not on a processed one", async () => {
  pool((request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, {
          values: [
            anItem("mine"),
            // Held from an earlier read: the pool would not answer it as work.
            anItem("gone", { revisedInto: ["later"] }),
          ],
        })
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("mine");

  await open(1);
  expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
  expect(screen.getByText("revised")).toBeDefined();

  await open(0);
  expect(screen.getAllByRole("button", { name: "edit" })).toHaveLength(1);
});

test("says on the row it opens when an item was last touched", async () => {
  const touchedAt = "2026-08-19T22:14:00.000Z";

  pool((request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, {
          values: [
            anItem("touched", {
              createdAt: "2026-08-01T09:00:00.000Z",
              contentUpdatedAt: touchedAt,
            }),
            anItem("fresh", { createdAt: "2026-08-02T09:00:00.000Z" }),
          ],
        })
      : json(200, { values: [] }),
  );

  render(Queue);
  await screen.findByText("touched");

  // A plain fact about the note rather than what orders it, so it waits for
  // the row to open along with everything else the rail knows.
  expect(screen.queryByText(briefly(touchedAt))).toBeNull();

  await open(0);
  expect(await screen.findByText(briefly(touchedAt))).toBeDefined();

  // The other row, which is now the only collapsed one left.
  await open(0);
  expect(await screen.findByText("not since capture")).toBeDefined();
});

/** Furling hides the rail, and the stamp is the only way into a row. */
test("keeps a way into a row with the rail furled", async () => {
  pool(queued("one"));
  rail.toggle();

  render(Queue);
  await screen.findByText("one");

  await open(0);
  expect(screen.getAllByRole("button", { name: "archive" })).toHaveLength(1);
});

test("reads from the end the reader last chose, not the one the queue defaults to", async () => {
  remember("queue", "newest-first");
  const transport = pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  const read = transport.sent.find(
    (request) => routeOf(request) === "GET /v1/queue",
  );
  expect(new URL(read!.url).searchParams.get("order")).toBe("newest-first");
});
