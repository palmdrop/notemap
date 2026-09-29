import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";
import { expect, test } from "vitest";

import Appearance from "./Appearance.svelte";

const group = (name: string) => within(screen.getByRole("group", { name }));
const option = (name: string, among = "Theme") =>
  group(among).getByRole("button", { name });
const chosen = (among = "Theme") =>
  group(among)
    .getAllByRole("button")
    .find((one) => one.getAttribute("aria-pressed") === "true")
    ?.textContent?.trim();
const wearing = () => document.documentElement.dataset["theme"];

test("offers the three palettes and marks the one on", async () => {
  render(Appearance);

  // Nothing said yet, so the browser's own answer stands.
  expect(chosen()).toBe("auto");
  expect(wearing()).toBeUndefined();

  await fireEvent.click(option("dark"));
  expect(chosen()).toBe("dark");
  expect(option("dark").classList.contains("font-semibold")).toBe(true);
  expect(option("auto").classList.contains("font-semibold")).toBe(false);
  expect(wearing()).toBe("dark");

  await fireEvent.click(option("auto"));
  expect(chosen()).toBe("auto");
  expect(wearing()).toBeUndefined();
});

test("remembers the choice, so a reload does not undo it", async () => {
  render(Appearance);
  await fireEvent.click(option("light"));

  expect(localStorage.getItem("notemap:theme")).toBe("light");

  cleanup();
  render(Appearance);
  expect(chosen()).toBe("light");
});

test("offers the three ways of drawing rows, auto until one is chosen, and remembers it", async () => {
  render(Appearance);
  expect(chosen("Rows")).toBe("auto");

  await fireEvent.click(option("by day", "Rows"));
  expect(chosen("Rows")).toBe("by day");
  expect(localStorage.getItem("notemap:rows")).toBe("by day");

  cleanup();
  render(Appearance);
  expect(chosen("Rows")).toBe("by day");
});
