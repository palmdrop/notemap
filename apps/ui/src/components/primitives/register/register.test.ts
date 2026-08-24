import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Fixture from "./Register.fixture.svelte";

/** The grid does the hiding, so this is the one thing the markup has to say. */
test("the register says whether its rail is furled", () => {
  const { container, rerender } = render(Fixture, { furled: false });
  const grid = () => container.querySelector("[data-furled]");

  expect(grid()).toBeNull();

  void rerender({ furled: true });
  expect(grid()).not.toBeNull();
});

test("a whole cell opens the row it belongs to", async () => {
  const picked = vi.fn();
  render(Fixture, { onpick: picked });

  await fireEvent.click(screen.getByText("the rail"));
  await fireEvent.click(screen.getByText("the body"));

  expect(picked).toHaveBeenCalledTimes(2);
});

/** A tag is worth clicking for its own sake, and is not the row's click. */
test("a control inside a cell is not the cell's click", async () => {
  const picked = vi.fn();
  render(Fixture, { onpick: picked });

  await fireEvent.click(screen.getByRole("button", { name: "a tag" }));

  expect(picked).not.toHaveBeenCalled();
});
