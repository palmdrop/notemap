import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { NO_MORE_OFFLINE } from "$lib/said";

import More from "./More.svelte";
import Fixture from "./Register.fixture.svelte";

/**
 * The box is the selection: the rail takes the head and the left edge, the
 * body the head and the right edge, and nothing else about either cell changes.
 */
test("a selected row's cells draw the box, and an unselected row's draw none", () => {
  const { container, rerender } = render(Fixture, { selected: false });
  const cells = () => [...container.querySelectorAll("[data-selected]")];

  expect(cells()).toEqual([]);

  void rerender({ selected: true });
  expect(cells()).toHaveLength(2);
  const [rail, body] = cells() as HTMLElement[];
  expect(rail?.className).toContain("border-l");
  expect(rail?.className).toContain("border-t");
  expect(body?.className).toContain("border-r");
  expect(body?.className).toContain("border-t");
});

test("a whole cell selects the row it belongs to", async () => {
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

test("the foot offers the next page, or says why it cannot", async () => {
  const more = vi.fn();
  const { rerender } = render(More, {
    loading: false,
    offline: false,
    onmore: more,
  });

  await fireEvent.click(screen.getByRole("button", { name: "load more" }));
  expect(more).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(NO_MORE_OFFLINE)).toBeNull();

  void rerender({ loading: true, offline: false, onmore: more });
  expect(screen.getByRole("button", { name: "loading…" })).toHaveProperty(
    "disabled",
    true,
  );

  // Not a disabled action: offline there is no page to promise, only a reason.
  void rerender({ loading: false, offline: true, onmore: more });
  expect(screen.getByText(NO_MORE_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});
