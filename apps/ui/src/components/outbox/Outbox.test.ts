import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, refusal, routeOf } from "@notemap/client/testing";

import { client, pool } from "../../testing/pool";
import Outbox from "./Outbox.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

test("shows what the pool refused, and lets it be dismissed", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/captures"
      ? refusal(400, "payload-invalid")
      : json(200, { values: [] }),
  );

  render(Outbox);

  await client.capture({ channel: "web-manual", text: "" });
  await client.drain();

  const said = await screen.findByText(/nothing to capture/);
  expect(said.textContent).toContain("capture:");

  await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

  await vi.waitFor(() => {
    expect(screen.queryByText(/nothing to capture/)).toBeNull();
  });
});
