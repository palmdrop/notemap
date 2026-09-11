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

/**
 * `inverted` sets the ink to paper, and every text colour utility is emitted
 * after it — so a row that is walked onto wears the mark alone, or it draws
 * ink on ink.
 */
test("a row walked onto is inverted and carries no other colour", () => {
  render(WalkedFixture, { on: true, dim: true, ontake: vi.fn() });

  const row = screen.getByRole("option", { name: "a row" });
  expect(row.classList.contains("inverted")).toBe(true);
  expect([...row.classList].some((one) => one.startsWith("text-"))).toBe(false);
});

test("a row not walked onto is dim, held, or plain, in that precedence", () => {
  render(WalkedFixture, { held: true, dim: true, ontake: vi.fn() });

  const row = screen.getByRole("option", { name: "a row" });
  expect(row.classList.contains("text-accent")).toBe(true);
  expect(row.classList.contains("inverted")).toBe(false);
});
