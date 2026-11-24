import { afterEach, expect, test, vi } from "vitest";

import { address } from "$testing/address.svelte";

import { arrived, trail } from "./trail.svelte";

vi.mock("$app/navigation", () => import("$testing/router"));
vi.mock("$app/state", () => import("$testing/address.svelte"));

afterEach(() => {
  address.state = {};
  vi.restoreAllMocks();
});

test("leaving after steps goes back past every one of them to where the walk began", async () => {
  const go = vi.spyOn(history, "go").mockImplementation(() => undefined);
  arrived(true);
  await trail.step("/items/two/process");
  await trail.step("/items/three/process");
  await trail.moveOn("/items/four/process");

  trail.leave("/");
  expect(go).toHaveBeenCalledWith(-3);
});

test("an entry come back to keeps its own place in the walk", async () => {
  arrived(true);
  await trail.step("/items/two");
  address.state = { trail: { within: true, steps: 1 } };
  arrived(false);
  expect(trail.steps).toBe(1);
  expect(trail.within).toBe(true);
});

test("a walk begun at an address leaves for home", async () => {
  const go = vi.spyOn(history, "go").mockImplementation(() => undefined);
  arrived(false);
  await trail.step("/items/two");

  trail.leave("/feed");
  expect(go).not.toHaveBeenCalled();
  expect(address.path).toBe("/feed");
});
