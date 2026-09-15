import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import { commandsFor, type Surroundings } from "$lib/command/item";
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

/**
 * What a surface hands the row. `Actions` is given the list rather than the
 * item, so a test builds it the way the queue and the item page do.
 */
const at: Surroundings = {
  onprocess: () => undefined,
  onedit: () => undefined,
};

function drawing(item = anItem("one"), extra: Partial<Surroundings> = {}) {
  return { commands: commandsFor(item, { ...at, ...extra }) };
}

function draw(item = anItem("one")) {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/unarchive"
      ? json(200, anItem("one"))
      : json(200, { values: [] }),
  );

  return render(Actions, drawing(item, { address: "/items/one" }));
}

/** The two groups as drawn: the quick tier on the left, the rest on the right. */
function groups(container: Element) {
  return [...(container.firstElementChild?.children ?? [])].map((group) =>
    [...group.children].map((cell) => cell.textContent?.trim()),
  );
}

/**
 * The quick tier is every decision that needs no destination — `process` is
 * the door to the one that does — and working with the item is the other
 * group, so that the two are never read as six of a kind.
 */
test("draws the decisions on the left and the rest on the right", () => {
  clipboard();
  const { container } = draw(saying("a note"));

  expect(groups(container)).toEqual([
    ["process", "manual", "discard"],
    ["edit", "copy", "open"],
  ]);
});

test("marks manual at once, with no note, and offers the way back in the corner", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/mark-processed"
      ? json(200, {
          id: "rec",
          item: "one",
          at: "2026-09-03T10:00:00.000Z",
          state: "delivered",
          target: { kind: "user" },
        })
      : json(200, { values: [] }),
  );
  render(Actions, drawing(anItem("one")));

  await fireEvent.click(screen.getByRole("button", { name: "manual" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });
  expect(screen.queryByLabelText("where it went")).toBeNull();

  const said = await vi.waitFor(() => {
    const raised = notices.shown.at(-1);
    expect(raised?.what).toBe("marked manual");
    return raised;
  });
  expect(said?.offer?.label).toBe("undo");
  // Keyed to the record, so the log's own entry for it adds nothing.
  expect(said?.key).toBe("record:rec");
  // Filing where the person said to file is not a failure: it stands so its
  // undo does not time out, but it is not the accent.
  expect(said?.alarm).toBe(false);
});

test("discards at once and offers the way back in the corner", async () => {
  draw();
  render(Actions, drawing(anItem("two")));

  await fireEvent.click(
    screen.getAllByRole("button", { name: "discard" }).at(-1)!,
  );

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/two/archive");
  });
  expect(notices.shown.at(-1)?.what).toBe("discarded");
  expect(notices.shown.at(-1)?.offer?.label).toBe("undo");
  expect(notices.shown.at(-1)?.alarm).toBe(false);
});

/** The one grey: a decision that cannot be taken says why, and stays in place. */
test("cannot mark manual offline, and cannot discard what is discarded", () => {
  const { rerender } = render(
    Actions,
    drawing(anItem("one"), { offline: true }),
  );
  const control = (name: string) =>
    screen.getByRole("button", { name }) as HTMLButtonElement;

  expect(control("manual").disabled).toBe(true);
  expect(control("manual").title).toBe("pool out of reach");
  expect(control("discard").disabled).toBe(false);

  void rerender(
    drawing(
      anItem("one", { archived: { archivedAt: "2026-09-04T10:00:00.000Z" } }),
      { offline: false },
    ),
  );
  expect(control("discard").disabled).toBe(true);
  expect(control("manual").disabled).toBe(false);
});

/**
 * `navigator.clipboard` is a secure context's alone — HTTPS or `localhost` — and
 * a daemon reached over plain HTTP at a LAN address has none. There is nothing
 * to fall back to, so the line closes up rather than offering what would fail.
 */
test("offers no copy where the browser hands over no clipboard", () => {
  const { container } = draw(saying("a note"));

  expect(screen.queryByRole("button", { name: "copy" })).toBeNull();
  expect(groups(container)[1]).toEqual(["edit", "open"]);
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
  draw(
    anItem("one", {
      routing: { records: 1, pending: 0, to: [], templates: [] },
    }),
  );

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
test("offers the way back on a discarded item, beside the way out", async () => {
  draw(anItem("one", { archived: { archivedAt: "2026-09-04T10:00:00.000Z" } }));

  expect(screen.getByRole("button", { name: "process" })).toBeDefined();
  await fireEvent.click(screen.getByRole("button", { name: "undiscard" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/unarchive");
  });
});

test("offers no way back on an item that is not discarded", () => {
  draw();

  expect(screen.queryByRole("button", { name: "undiscard" })).toBeNull();
  expect(screen.queryByRole("button", { name: "unarchive" })).toBeNull();
});

/** The log narrowed to this item, offered only where the item is already open. */
test("offers history where there is no address to open", () => {
  clipboard();
  const { container } = render(Actions, drawing(saying("a note")));

  expect(groups(container)[1]).toEqual(["edit", "copy", "history"]);
  expect(
    screen.getByRole("link", { name: "history" }).getAttribute("href"),
  ).toBe("/log?item=one");
});

test("offers no history where open leads to the item", () => {
  draw();

  expect(screen.queryByRole("link", { name: "history" })).toBeNull();
});
