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

/**
 * jsdom applies no media query, so this pins the rule rather than its effect:
 * the day and the time are laid out to stack, not merely wrapped in a block —
 * a container alone leaves two inline children on one line.
 */
test("lays the day over the time below the breakpoint", () => {
  const at = new Date(2026, 8, 2, 11, 14).toISOString();
  const { container } = render(Stamp, { at });

  const written = container.querySelector("span");
  expect(written?.className).toContain("max-narrow:flex-col");
  expect(written?.children).toHaveLength(2);
});

test("says what became of an item, in one word", () => {
  render(StateWord, { word: "archived" });
  expect(screen.getByText("archived")).toBeDefined();
});
