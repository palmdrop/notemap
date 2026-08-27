import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { looking, online } from "$testing/dom";
import Fixture from "./reachable.fixture.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

test("tells the client when nobody is looking, and when someone is again", async () => {
  pool(() => json(200, { values: [] }));
  const told = vi.spyOn(client, "watched");

  const { unmount } = render(Fixture);
  expect(told).toHaveBeenCalledWith(true);

  looking(false);
  expect(told).toHaveBeenLastCalledWith(false);

  looking(true);
  expect(told).toHaveBeenLastCalledWith(true);

  unmount();
  expect(told).toHaveBeenLastCalledWith(false);
});

test("takes the browser's offline as a second no", async () => {
  pool(() => json(200, { values: [] }));

  render(Fixture);
  expect(await screen.findByText("reachable")).toBeDefined();

  online(false);
  expect(await screen.findByText("offline")).toBeDefined();
});

test("wires the browser's listeners once, however many surfaces read them", async () => {
  pool(() => json(200, { values: [] }));

  const one = render(Fixture);
  const two = render(Fixture);
  const drained = vi.spyOn(client, "drain");

  online(false);
  online(true);
  expect(drained).toHaveBeenCalledTimes(1);

  // The last reader out takes them with it.
  one.unmount();
  online(false);
  online(true);
  expect(drained).toHaveBeenCalledTimes(2);

  two.unmount();
  online(false);
  online(true);
  expect(drained).toHaveBeenCalledTimes(2);
});
