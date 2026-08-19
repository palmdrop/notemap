import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Option from "./Option.svelte";

test("a chosen option reads back as chosen", () => {
  render(Option, {
    label: "obsidian vault",
    chosen: true,
    onchoose: vi.fn(),
  });

  expect(
    screen.getByRole("button", { name: /obsidian vault/ }),
  ).toHaveProperty("ariaPressed", "true");
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
