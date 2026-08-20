import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import ThemeToggle from "./ThemeToggle.svelte";

const control = () => screen.getByRole("button", { name: "Theme" });
const said = () => control().textContent?.trim();
const wearing = () => document.documentElement.dataset["theme"];

test("cycles the palette and says which one is on", async () => {
  render(ThemeToggle);

  // Nothing said yet, so the browser's own answer stands.
  expect(said()).toBe("auto");
  expect(wearing()).toBeUndefined();

  await fireEvent.click(control());
  expect(said()).toBe("light");
  expect(wearing()).toBe("light");

  await fireEvent.click(control());
  expect(said()).toBe("dark");
  expect(wearing()).toBe("dark");

  await fireEvent.click(control());
  expect(said()).toBe("auto");
  expect(wearing()).toBeUndefined();
});

test("remembers the choice, so a reload does not undo it", async () => {
  render(ThemeToggle);
  await fireEvent.click(control());

  expect(localStorage.getItem("notemap:theme")).toBe("light");

  cleanup();
  render(ThemeToggle);
  expect(said()).toBe("light");
});
