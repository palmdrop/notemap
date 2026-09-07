import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Sources from "./Sources.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

function serving(values: readonly Record<string, unknown>[]) {
  return pool((request) =>
    routeOf(request) === "GET /v1/sources"
      ? json(200, { values })
      : json(200, {}),
  );
}

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

test("lists each source with what it captured and how long ago", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  serving([
    { id: "memos", items: 12, lastCapturedAt: "2026-09-07T11:59:00.000Z" },
    { id: "web-manual", items: 3, lastCapturedAt: "2026-09-07T11:00:00.000Z" },
  ]);

  render(Sources);

  await vi.waitFor(() => expect(screen.getByText("memos")).toBeDefined());

  expect(screen.getByText("2 seen")).toBeDefined();
  expect(screen.getByText("12 captured · last 1m ago")).toBeDefined();
  expect(screen.getByText("3 captured · last 1h ago")).toBeDefined();
  expect(asked()).toContain("GET /v1/sources");

  vi.useRealTimers();
});

test("says a pool that has captured nothing has seen no source", async () => {
  serving([]);

  render(Sources);

  await vi.waitFor(() => expect(screen.getByText("none yet")).toBeDefined());
});
