import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Option from "./Option.svelte";
import WalkedFixture from "./Walked.fixture.svelte";

test("a chosen option reads back as chosen", () => {
  render(Option, {
    label: "obsidian vault",
    chosen: true,
    onchoose: vi.fn(),
  });

  expect(screen.getByRole("button", { name: /obsidian vault/ })).toHaveProperty(
    "ariaPressed",
    "true",
  );
});

test("an unavailable option stays in the list and says why", () => {
  render(Option, {
    label: "old laptop",
    why: "unavailable — no such volume",
    onchoose: vi.fn(),
  });

  const option = screen.getByRole("button", { name: /old laptop/ });
  expect((option as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("unavailable — no such volume")).toBeDefined();
});

test("an available option reports the choice", async () => {
  const chose = vi.fn();
  render(Option, { label: "todo.txt", onchoose: chose });

  await fireEvent.click(screen.getByRole("button", { name: /todo.txt/ }));
  expect(chose).toHaveBeenCalledTimes(1);
});

/** Weight is the mark, and there is no colour for a row to wear beside it. */
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
