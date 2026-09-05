import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import Actions from "./Actions.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => {
  notices.clear();
  Reflect.deleteProperty(navigator, "clipboard");
});

/** What the browser hands a secure context, which jsdom has none of. */
function clipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const held = { writeText: vi.fn(() => Promise.resolve()) };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: held,
  });
  return held;
}

/** A capture with words in it, which is what `copy` has something to take of. */
function saying(text: string) {
  return anItem("one", {
    payload: { type: "text", content: { text }, metadata: {}, assets: [] },
  });
}

function draw(item = anItem("one")) {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/unarchive"
      ? json(200, anItem("one"))
      : json(200, { values: [] }),
  );

  return render(Actions, {
    item,
    address: "/items/one",
    onprocess: () => undefined,
    onedit: () => undefined,
  });
}

/** The line as drawn, which is what "beside each other" is a claim about. */
function line(container: Element) {
  return [...(container.firstElementChild?.children ?? [])].map((cell) =>
    cell.textContent?.trim(),
  );
}

/**
 * One way out of the queue. Route, done and archive were three controls of
 * unclear rank drawn as siblings; what differed between them is the composer's
 * first step now, and four controls need no second line to be told apart.
 */
test("draws every action on one line", () => {
  clipboard();
  const { container } = draw(saying("a note"));

  expect(line(container)).toEqual(["process", "copy", "edit", "open"]);
});

/**
 * `navigator.clipboard` is a secure context's alone — HTTPS or `localhost` — and
 * a daemon reached over plain HTTP at a LAN address has none. There is nothing
 * to fall back to, so the line closes up rather than offering what would fail.
 */
test("offers no copy where the browser hands over no clipboard", () => {
  const { container } = draw(saying("a note"));

  expect(screen.queryByRole("button", { name: "copy" })).toBeNull();
  expect(line(container)).toEqual(["process", "edit", "open"]);
});

test("offers no copy of a capture that says nothing", () => {
  clipboard();
  draw(
    anItem("one", {
      payload: { type: "image", content: {}, metadata: {}, assets: [] },
    }),
  );

  expect(screen.queryByRole("button", { name: "copy" })).toBeNull();
});

/**
 * Discarding replays from the outbox, so the door has to open whatever the pool
 * is doing. What a decision needs of it is said inside the composer.
 */
test("never disables the way out", () => {
  draw();

  const process = screen.getByRole("button", { name: "process" });
  expect((process as HTMLButtonElement).disabled).toBe(false);
});

test("asks nothing of the pool by being drawn", () => {
  draw(anItem("one", { routing: { records: 1, pending: 0, to: [] } }));

  expect(asked()).toEqual([]);
});

test("copies the capture's text and says in the corner what it took", async () => {
  const held = clipboard();
  draw(saying("a note"));

  await fireEvent.click(screen.getByRole("button", { name: "copy" }));

  await vi.waitFor(() => {
    expect(held.writeText).toHaveBeenCalledWith("a note");
  });
  expect(notices.shown.map((notice) => notice.what)).toContain("copied");
  expect(notices.shown.at(-1)?.about).toContain("a note");
});

/**
 * Unarchiving puts an item back rather than sending it away, so it is not
 * behind the door that means leaving.
 */
test("offers the way back on an archived item, beside the way out", async () => {
  draw(anItem("one", { archived: { archivedAt: "2026-09-04T10:00:00.000Z" } }));

  expect(screen.getByRole("button", { name: "process" })).toBeDefined();
  await fireEvent.click(screen.getByRole("button", { name: "unarchive" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/unarchive");
  });
});

test("offers no way back on an item that is not archived", () => {
  draw();

  expect(screen.queryByRole("button", { name: "unarchive" })).toBeNull();
});
