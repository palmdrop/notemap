import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf, VERSION } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Server from "./Server.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

/** `asked()` drops health on purpose; this is where it is the subject. */
const probes = (transport: { readonly sent: readonly Request[] }) =>
  transport.sent.map(routeOf).filter((route) => route === "GET /v1/health");

test("says the daemon is available without anyone pressing anything", async () => {
  const transport = pool(() => json(200, { values: [] }));

  render(Server);

  await screen.findByText(/available/);
  await vi.waitFor(() => expect(probes(transport).length).toBeGreaterThan(0));
});

test("says the daemon's own version, from the health probe", async () => {
  pool(() => json(200, { values: [] }));

  render(Server);

  await screen.findByText(VERSION);
});

test("asks again on request, out of the probe's own turn", async () => {
  const transport = pool(() => json(200, { values: [] }));

  render(Server);
  await screen.findByText(/available/);
  const before = probes(transport).length;

  await press("check again");

  await vi.waitFor(() =>
    expect(probes(transport).length).toBeGreaterThan(before),
  );
});

test("says the daemon is unavailable rather than saying nothing", async () => {
  const transport = pool(() => json(200, { values: [] }));
  transport.unreachable(true);

  render(Server);

  await screen.findByText(/unavailable/);
});

test("sources are folded, and shown on request", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/sources"
      ? json(200, {
          values: [
            {
              id: "memos",
              items: 12,
              lastCapturedAt: "2026-09-07T11:59:00.000Z",
            },
          ],
        })
      : json(200, {}),
  );

  render(Server);

  expect(screen.queryByText("memos")).toBeNull();
  await press("show");

  await screen.findByText("memos");
  expect(asked()).toContain("GET /v1/sources");

  await press("hide");
  expect(screen.queryByText("memos")).toBeNull();
});
