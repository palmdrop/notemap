import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Going from "./Going.svelte";

const moving = vi.hoisted(() => ({ to: null as unknown }));

vi.mock("$app/state", () => ({
  navigating: moving,
}));

test("draws a line along the top while a page is under way", () => {
  moving.to = { url: new URL("http://localhost/feed") };

  render(Going);

  expect(
    screen.getByRole("progressbar", { name: "Opening the page" }),
  ).toBeDefined();
});

test("draws nothing once the page is there", () => {
  moving.to = null;

  render(Going);

  expect(screen.queryByRole("progressbar")).toBeNull();
});
