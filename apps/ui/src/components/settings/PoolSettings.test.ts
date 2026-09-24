import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool, sent } from "$testing/pool";
import PoolSettings from "./PoolSettings.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

function serving(
  values: readonly Record<string, unknown>[] = [
    { name: "unfurl", value: true },
  ],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/settings") return json(200, { values });
    if (route === "PATCH /v1/settings") return json(200, { values });
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("draws what the pool said", async () => {
  serving([{ name: "unfurl", value: true }]);

  render(PoolSettings);

  await screen.findByText("unfurl");
  const yes = await screen.findByRole("button", { name: "yes" });
  expect(yes.getAttribute("aria-pressed")).toBe("true");
  const no = screen.getByRole("button", { name: "no" });
  expect(no.getAttribute("aria-pressed")).toBe("false");
});

test("flipping it sends only that pool setting", async () => {
  serving([{ name: "unfurl", value: true }]);

  render(PoolSettings);

  await fireEvent.click(await screen.findByRole("button", { name: "no" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("PATCH /v1/settings");
  });
  expect(await sent()).toEqual([{ unfurl: false }]);
});

test("reads unavailable with the pool unreachable", async () => {
  const transport = serving();
  transport.unreachable(true);

  render(PoolSettings);

  await screen.findByText("unavailable while the pool is unreachable");
});

test("a cold client draws it as unread rather than as on, while the read is in flight", async () => {
  let settle!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  pool((request) =>
    routeOf(request) === "GET /v1/settings"
      ? pending
      : json(404, { error: { code: "unknown-route" } }),
  );

  render(PoolSettings);

  await screen.findByText("reading…");
  expect(screen.queryByRole("button", { name: "yes" })).toBeNull();

  settle(json(200, { values: [{ name: "unfurl", value: true }] }));
  await screen.findByRole("button", { name: "yes" });
});
