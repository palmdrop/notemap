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

const marked = {
  records: 1,
  pending: 0,
  to: [{ kind: "user" as const }],
};

function draw(item = anItem("one")) {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/mark-processed"
      ? json(200, {
          id: "rec",
          item: "one",
          at: "2026-09-04T10:00:00.000Z",
          state: "delivered",
          target: { kind: "user" },
        })
      : json(200, { values: [] }),
  );

  return render(Actions, {
    item,
    offline: false,
    address: "/items/one",
    onroute: () => undefined,
    onedit: () => undefined,
  });
}

/** The lines as drawn, which is what "aligned" is a claim about. */
function lines(container: Element) {
  return [...(container.firstElementChild?.children ?? [])].map((line) =>
    [...line.children].map((cell) => cell.textContent?.trim()),
  );
}

test("draws leaving the queue on one line and working with the item on the other", () => {
  clipboard();
  const { container } = draw(saying("a note"));

  expect(lines(container)).toEqual([
    ["route", "done", "archive"],
    ["copy", "edit", "open"],
  ]);
});

/**
 * `navigator.clipboard` is a secure context's alone — HTTPS or `localhost` — and
 * a daemon reached over plain HTTP at a LAN address has none. There is nothing
 * to fall back to, so the line closes up rather than offering what would fail.
 */
test("offers no copy where the browser hands over no clipboard", () => {
  const { container } = draw(saying("a note"));

  expect(screen.queryByRole("button", { name: "copy" })).toBeNull();
  expect(lines(container)).toEqual([
    ["route", "done", "archive"],
    ["edit", "open"],
  ]);
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

test("opens one field for where it went, and `⏎` sends it", async () => {
  draw();
  expect(screen.queryByLabelText("where it went")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "done" }));

  const field = screen.getByLabelText("where it went");
  await fireEvent.input(field, {
    target: { value: "pasted into the standup doc" },
  });
  await fireEvent.keyDown(field, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });
  // Put away by the answer rather than by the keystroke, so a refusal has
  // something to leave behind.
  await vi.waitFor(() => {
    expect(screen.queryByLabelText("where it went")).toBeNull();
  });
});

test("sends an empty field as readily as a written one", async () => {
  draw();

  await fireEvent.click(screen.getByRole("button", { name: "done" }));
  await fireEvent.keyDown(screen.getByLabelText("where it went"), {
    key: "Enter",
  });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/mark-processed");
  });
});

test("`esc` puts the field away without marking anything", async () => {
  draw();

  await fireEvent.click(screen.getByRole("button", { name: "done" }));
  await fireEvent.keyDown(screen.getByLabelText("where it went"), {
    key: "Escape",
  });

  expect(screen.queryByLabelText("where it went")).toBeNull();
  expect(asked()).not.toContain("POST /v1/items/one/mark-processed");
});

/** The row's one typed thing: a refusal that emptied the field would take it. */
test("keeps what was written when the pool refuses the decision", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/items/one/mark-processed"
      ? json(400, { error: { code: "arguments-invalid" } })
      : json(200, { values: [] }),
  );

  render(Actions, {
    item: anItem("one"),
    offline: false,
    onroute: () => undefined,
    onedit: () => undefined,
  });

  await fireEvent.click(screen.getByRole("button", { name: "done" }));
  const field = screen.getByLabelText("where it went");
  await fireEvent.input(field, { target: { value: "the standup doc" } });
  await fireEvent.keyDown(field, { key: "Enter" });

  await screen.findByRole("status");
  expect(
    (screen.getByLabelText("where it went") as HTMLInputElement).value,
  ).toBe("the standup doc");
});

/**
 * A rule about the summary, not about the records: the row draws no records
 * while it is shut, and marking one twice is what the summary already answers.
 */
test("does not offer `done` to an item whose summary already names the person", () => {
  draw(anItem("one", { routing: marked }));

  expect(screen.queryByRole("button", { name: "done" })).toBeNull();
  expect(screen.getByRole("button", { name: "route" })).toBeDefined();
});

test("goes on offering `done` where the summary names only a destination", () => {
  draw(
    anItem("one", {
      routing: {
        records: 1,
        pending: 0,
        to: [{ kind: "destination", destination: "vault-1" }],
      },
    }),
  );

  expect(screen.getByRole("button", { name: "done" })).toBeDefined();
});

test("copies the capture's text and says in the corner what it took", async () => {
  const held = clipboard();
  draw(
    anItem("one", {
      payload: {
        type: "text",
        content: { text: "a note" },
        metadata: {},
        assets: [],
      },
    }),
  );

  await fireEvent.click(screen.getByRole("button", { name: "copy" }));

  await vi.waitFor(() => {
    expect(held.writeText).toHaveBeenCalledWith("a note");
  });
  expect(notices.shown.map((notice) => notice.what)).toContain("copied");
  expect(notices.shown.at(-1)?.about).toContain("a note");
});

test("offers the way back on an archived item rather than a second archive", () => {
  draw(anItem("one", { archived: { archivedAt: "2026-09-04T10:00:00.000Z" } }));

  expect(screen.getByRole("button", { name: "unarchive" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "archive" })).toBeNull();
});
