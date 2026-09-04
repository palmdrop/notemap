import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, refusal, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import Corner from "./Corner.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => {
  notices.clear();
});

test("says what logged, and lets a standing one be dismissed", async () => {
  pool(() => json(200, { values: [] }));
  render(Corner);

  notices.raise({ what: "routed · obsidian", why: "notes/inbox/picker.md" });
  const said = await screen.findByRole("status");
  expect(said.textContent).toContain("routed · obsidian");
  expect(said.textContent).toContain("notes/inbox/picker.md");
  expect(screen.queryByRole("button", { name: "dismiss" })).toBeNull();

  notices.raise({ what: "delivery failed · vault", standing: true });
  const stands = await screen.findByRole("alert");
  expect(stands.textContent).toContain("delivery failed · vault");

  await fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/** The shell hovers to the accent everywhere else, which on an accent panel is gone. */
test("keeps its controls readable on a filled panel", async () => {
  pool(() => json(200, { values: [] }));
  render(Corner);

  notices.raise({ what: "given up", href: "/log", standing: true });

  const panel = await screen.findByRole("alert");
  expect(panel.className).toContain("filled");
});

test("a notice about something leads to where it can be read", async () => {
  pool(() => json(200, { values: [] }));
  render(Corner);

  notices.raise({
    what: "work abandoned",
    href: "/items/abc",
    standing: true,
  });

  const look = await screen.findByRole("link", { name: "look" });
  expect(look.getAttribute("href")).toBe("/items/abc");
});

test("a refusal is still drawn, in the same corner", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? refusal(400, "payload-invalid")
      : json(200, { values: [] }),
  );

  render(Corner);

  await client.capture({ channel: "web-manual", text: "" });
  await client.drain();

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("capture");
});

function anAction(id: string, kind: string, detail: Record<string, unknown>) {
  return {
    id,
    kind,
    subject: "one",
    by: { kind: "notemap" },
    at: `2026-09-03T10:0${id}:00.000Z`,
    detail,
  };
}

/** The log is the only place this is written, and nobody was reading it. */
test("says what logged while nobody was asking", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged });
    }
    if (route === "GET /v1/items/one") {
      return json(
        200,
        anItem("one", {
          payload: {
            type: "text",
            content: { text: "the picker needs a trail" },
            metadata: {},
            assets: [],
          },
        }),
      );
    }
    return json(200, { values: [] });
  });

  render(Corner);

  // The first read is the mark, and says nothing about what was already there.
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.queryByRole("alert")).toBeNull();

  logged = [
    anAction("2", "delivery-failed", {
      record: "r1",
      attempt: 3,
      failure: { code: "unreachable", detail: "the vault is not mounted" },
    }),
    ...logged,
  ];

  await vi.advanceTimersByTimeAsync(10_000);

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("delivery failed");
  expect(said.textContent).toContain("the vault is not mounted");

  // Which capture it was about: the log names an id, and nobody reads ids.
  await vi.waitFor(() => {
    expect(screen.getByRole("alert").textContent).toContain(
      "the picker needs a trail",
    );
  });

  // And a way through to the whole of it, which is the item it happened to.
  expect(screen.getByRole("link", { name: "look" }).getAttribute("href")).toBe(
    "/items/one",
  );

  vi.useRealTimers();
});

test("does not repeat a landing this shell has already reported", async () => {
  vi.useFakeTimers();
  let logged: ReturnType<typeof anAction>[] = [];

  pool((request) =>
    routeOf(request).startsWith("GET /v1/actions")
      ? json(200, { values: logged })
      : json(200, { values: [] }),
  );

  render(Corner);
  await vi.advanceTimersByTimeAsync(100);

  // What the composer said when the decision was made.
  notices.raise({ what: "routed · Vault", key: "record:r1" });
  logged = [anAction("2", "routed", { record: "r1", pointer: "a.md" })];

  await vi.advanceTimersByTimeAsync(10_000);

  // The corner would be holding the poll's copy of it, had it raised one.
  expect(notices.shown).toHaveLength(0);
  expect(notices.said("record:r1")).toBe(true);

  vi.useRealTimers();
});

/**
 * A read that could not reach back to its mark is somebody who has been away.
 * A page of failures nobody may dismiss is not a report of what they missed.
 */
test("a catch-up too long to read out is counted, not enumerated", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];
  const paged: { next?: string } = {};

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged, ...paged });
    }
    return json(200, { values: [] });
  });

  render(Corner);
  await vi.advanceTimersByTimeAsync(100);

  // Nothing on the page reaches the mark, and there is a page after it.
  logged = ["9", "8", "7"].map((id) =>
    anAction(id, "delivery-failed", { record: `r${id}`, failure: {} }),
  );
  paged.next = "/v1/actions?after=2026-09-03T00%3A00%3A00.000Z%2C6";

  await vi.advanceTimersByTimeAsync(10_000);

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("3 or more things happened");
  expect(said.textContent).not.toContain("delivery failed");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "look" }).getAttribute("href")).toBe(
    "/log",
  );

  vi.useRealTimers();
});

test("a second long absence replaces the mark left by the first", async () => {
  vi.useFakeTimers();
  let logged = [anAction("1", "captured", {})];
  const paged: { next?: string } = {};

  pool((request) => {
    const route = routeOf(request);
    if (route.startsWith("GET /v1/actions")) {
      return json(200, { values: logged, ...paged });
    }
    return json(200, { values: [] });
  });

  render(Corner);
  await vi.advanceTimersByTimeAsync(100);

  paged.next = "/v1/actions?after=2026-09-03T00%3A00%3A00.000Z%2C6";
  logged = [anAction("9", "delivery-failed", { record: "r9", failure: {} })];
  await vi.advanceTimersByTimeAsync(10_000);
  await screen.findByRole("alert");

  logged = [anAction("99", "delivery-failed", { record: "r99", failure: {} })];
  await vi.advanceTimersByTimeAsync(10_000);

  await vi.waitFor(() => {
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  vi.useRealTimers();
});
