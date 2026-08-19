import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, refusal, routeOf } from "@notemap/client/testing";

import { client, pool } from "../../testing/pool";
import Refusals from "./Refusals.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

test("shows what the pool refused, and lets it be dismissed", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? refusal(400, "payload-invalid")
      : json(200, { values: [] }),
  );

  render(Refusals);

  await client.capture({ channel: "web-manual", text: "" });
  await client.drain();

  const said = await screen.findByRole("alert");
  expect(said.textContent).toContain("capture");
  expect(said.textContent).toMatch(/nothing to capture/);

  await fireEvent.click(screen.getByRole("button", { name: "dismiss" }));

  await vi.waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

test("says nothing about work that is only waiting for the daemon", async () => {
  const transport = pool(() => json(200, { values: [] }));
  transport.unreachable(true);

  render(Refusals);

  await client.capture({ channel: "web-manual", text: "waiting" });
  await client.drain();

  expect(screen.queryByRole("alert")).toBeNull();
});
