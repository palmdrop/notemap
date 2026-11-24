import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";
import { expect, test } from "vitest";

import Appearance from "./Appearance.svelte";

const group = (name: string) =>
  within(screen.getByRole("radiogroup", { name }));
const option = (name: string, among = "Theme") =>
  group(among).getByRole("radio", { name });
const chosen = (among = "Theme") =>
  group(among)
    .getAllByRole("radio")
    .find((one) => one.getAttribute("aria-checked") === "true")
    ?.textContent?.trim();
const wearing = () => document.documentElement.dataset["theme"];

test("offers the three palettes and marks the one on", async () => {
  render(Appearance);

  // Nothing said yet, so the browser's own answer stands.
  expect(chosen()).toBe("auto");
  expect(wearing()).toBeUndefined();

  await fireEvent.click(option("dark"));
  expect(chosen()).toBe("dark");
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

test("keeps only the theme: rows are read by day at every width", () => {
  render(Appearance);
  expect(screen.queryByRole("group", { name: "Rows" })).toBeNull();
});
