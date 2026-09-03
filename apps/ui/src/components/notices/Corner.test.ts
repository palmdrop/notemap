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
