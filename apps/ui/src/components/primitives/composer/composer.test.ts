import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import WalkedFixture from "./Walked.fixture.svelte";

test("a row walked onto is bold and carries no colour", () => {
  render(WalkedFixture, { on: true, ontake: vi.fn() });

  const row = screen.getByRole("option", { name: "a row" });
  expect(row.classList.contains("font-semibold")).toBe(true);
  expect([...row.classList].some((one) => one.startsWith("text-"))).toBe(false);
});

test("a row not walked onto is held, or plain", () => {
  render(WalkedFixture, { held: true, ontake: vi.fn() });

  const row = screen.getByRole("option", { name: "a row" });
  expect(row.classList.contains("underline")).toBe(true);
  expect(row.classList.contains("font-semibold")).toBe(false);
});
