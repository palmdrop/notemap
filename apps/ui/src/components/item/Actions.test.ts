import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import Actions from "./Actions.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => notices.clear());

/** What the browser hands a secure context, which jsdom has none of. */
function clipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const held = { writeText: vi.fn(() => Promise.resolve()) };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: held,
  });
  return held;
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

test("draws leaving the queue on one line and working with the item on the other", () => {
  const { container } = draw();

  const lines = [...(container.firstElementChild?.children ?? [])].map((line) =>
    [...line.children].map((cell) => cell.textContent?.trim()),
  );

  expect(lines).toEqual([
    ["route", "done", "archive"],
    ["copy", "edit", "open"],
  ]);
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
  expect(screen.queryByLabelText("where it went")).toBeNull();
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
