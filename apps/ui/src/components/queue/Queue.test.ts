import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "../../testing/pool";
import { briefly } from "$lib/stamp";
import { online } from "../../testing/dom";
import Queue from "./Queue.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

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
  await open(0);

  expect(await screen.findByText("none yet")).toBeDefined();
  expect(asked()).not.toContain("GET /v1/items/one/routing");
});

test("draws the way to add to the queue even when the queue is empty", async () => {
  pool(queued());

  render(Queue);

  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByLabelText("What to capture")).toBeDefined();
});

test("turns the queue around and reads it again from that end", async () => {
  const transport = pool(queued("one"));

  render(Queue);
  await screen.findByText("one");

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "newest-first" },
  });

  await vi.waitFor(() => {
    const orders = transport.sent
      .filter((request) => routeOf(request) === "GET /v1/queue")
      .map((request) => new URL(request.url).searchParams.get("order"));
    expect(orders).toEqual(["oldest-first", "newest-first"]);
  });
});

test("reads the drained queue as the thing it was working toward", async () => {
  pool(queued());

  render(Queue);

  // The state word idiom, which is what the register says became of a thing.
  expect(await screen.findByText("zero")).toBeDefined();
  expect(screen.getByText(/The queue is empty/)).toBeDefined();
  expect(screen.queryByText(/Empty —/)).toBeNull();
});

test("says on the collapsed row when an item was last touched", async () => {
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

  // The key the queue is ordered by, so it is readable without opening a row.
  expect(screen.getByText(briefly(touchedAt))).toBeDefined();
  expect(screen.queryByText("not since capture")).toBeNull();

  await open(1);

  expect(await screen.findByText("not since capture")).toBeDefined();
});

test("will not turn around while a read is still walking", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  pool(async (request: Request) => {
    if (routeOf(request) !== "GET /v1/queue") return json(200, { values: [] });
    await held;
    return json(200, { values: [anItem("one")] });
  });

  render(Queue);

  const control = screen.getByLabelText("Order") as HTMLSelectElement;
  expect(control.disabled).toBe(true);

  release();
  await screen.findByText("one");

  await vi.waitFor(() => expect(control.disabled).toBe(false));
});
