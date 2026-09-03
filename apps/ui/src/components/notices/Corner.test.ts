import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { json, refusal, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { notices } from "$lib/notices.svelte";
import Corner from "./Corner.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => {
  notices.clear();
});

test("says what happened, and lets a standing one be dismissed", async () => {
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

test("a notice about something leads to where it can be read", async () => {
  pool(() => json(200, { values: [] }));
  render(Corner);

  notices.raise({
    what: "work abandoned",
    href: "/log?item=abc",
    standing: true,
  });

  const look = await screen.findByRole("link", { name: "look" });
  expect(look.getAttribute("href")).toBe("/log?item=abc");
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
test("says what happened while nobody was asking", async () => {
  vi.useFakeTimers();
  let happened = [anAction("1", "captured", {})];

  pool((request) =>
    routeOf(request).startsWith("GET /v1/actions")
      ? json(200, { values: happened })
      : json(200, { values: [] }),
  );

  render(Corner);

  // The first read is the mark, and says nothing about what was already there.
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.queryByRole("alert")).toBeNull();

  happened = [
    anAction("2", "delivery-failed", {
      record: "r1",
      attempt: 3,
      failure: { code: "unreachable", detail: "the vault is not mounted" },
    }),
    ...happened,
  ];

  await vi.advanceTimersByTimeAsync(10_000);

  const said = screen.getByRole("alert");
  expect(said.textContent).toContain("delivery failed");
  expect(said.textContent).toContain("the vault is not mounted");

  vi.useRealTimers();
});

test("does not repeat a landing this shell has already reported", async () => {
  vi.useFakeTimers();
  let happened: ReturnType<typeof anAction>[] = [];

  pool((request) =>
    routeOf(request).startsWith("GET /v1/actions")
      ? json(200, { values: happened })
      : json(200, { values: [] }),
  );

  render(Corner);
  await vi.advanceTimersByTimeAsync(100);

  // What the composer said when the decision was made.
  notices.raise({ what: "routed · Vault", key: "record:r1" });
  happened = [anAction("2", "routed", { record: "r1", pointer: "a.md" })];

  await vi.advanceTimersByTimeAsync(10_000);

  // The corner would be holding the poll's copy of it, had it raised one.
  expect(notices.shown).toHaveLength(0);
  expect(notices.said("record:r1")).toBe(true);

  vi.useRealTimers();
});
