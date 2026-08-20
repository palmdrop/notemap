import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import Stamp from "./Stamp.svelte";
import StateWord from "./StateWord.svelte";

test("writes an instant as a date over a time, and keeps it machine-readable", () => {
  const at = new Date(2026, 7, 14, 9, 31).toISOString();
  render(Stamp, { at });

  expect(screen.getByText("2026-08-14")).toHaveProperty("dateTime", at);
  expect(screen.getByText("09:31")).toBeDefined();
});

test("says what became of an item, in one word", () => {
  render(StateWord, { word: "archived" });
  expect(screen.getByText("archived")).toBeDefined();
});
