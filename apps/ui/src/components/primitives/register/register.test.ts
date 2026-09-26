import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

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
    failed: false,
    onmore: more,
  });

  await fireEvent.click(screen.getByRole("button", { name: "load more" }));
  expect(more).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(NO_MORE_OFFLINE)).toBeNull();

  void rerender({ loading: true, offline: false, failed: false, onmore: more });
  expect(screen.getByRole("button", { name: /load more/ })).toHaveProperty(
    "disabled",
    true,
  );

  // Not a disabled action: offline there is no page to promise, only a reason.
  void rerender({ loading: false, offline: true, failed: false, onmore: more });
  expect(screen.getByText(NO_MORE_OFFLINE)).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function watchingTheFoot() {
  const seen: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        seen.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  return (isIntersecting: boolean) => {
    for (const callback of seen) callback([{ isIntersecting }]);
  };
}

const reading = { loading: false, offline: false, failed: false };

test("the foot asks for the next page when it scrolls near", async () => {
  const scroll = watchingTheFoot();
  const more = vi.fn();
  render(More, { ...reading, onmore: more });

  expect(more).not.toHaveBeenCalled();
  scroll(true);
  await vi.waitFor(() => {
    expect(more).toHaveBeenCalledTimes(1);
  });
});

test("a page that lands with the foot still near asks for the next", async () => {
  const scroll = watchingTheFoot();
  const more = vi.fn();
  const { rerender } = render(More, { ...reading, onmore: more });

  scroll(true);
  await vi.waitFor(() => {
    expect(more).toHaveBeenCalledTimes(1);
  });

  await rerender({ ...reading, loading: true, onmore: more });
  await rerender({ ...reading, onmore: more });
  expect(more).toHaveBeenCalledTimes(2);
});

test("a read that failed is not asked for again by scrolling", async () => {
  const scroll = watchingTheFoot();
  const more = vi.fn();
  const { rerender } = render(More, { ...reading, onmore: more });

  scroll(true);
  await vi.waitFor(() => {
    expect(more).toHaveBeenCalledTimes(1);
  });

  await rerender({ ...reading, loading: true, onmore: more });
  await rerender({ ...reading, failed: true, onmore: more });
  expect(more).toHaveBeenCalledTimes(1);

  // A press is how it is asked for again.
  await fireEvent.click(screen.getByRole("button", { name: "load more" }));
  expect(more).toHaveBeenCalledTimes(2);
});

test("the foot asks for nothing while offline", async () => {
  const scroll = watchingTheFoot();
  const more = vi.fn();
  render(More, { ...reading, offline: true, onmore: more });

  scroll(true);
  await Promise.resolve();
  expect(more).not.toHaveBeenCalled();
});

test("the first page read is the mark alone, there being nothing yet to have more of", () => {
  render(More, { ...reading, loading: true, first: true, onmore: vi.fn() });

  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector("[data-asking]")).not.toBeNull();
});

test("the foot keeps its width while it loads", () => {
  render(More, { ...reading, loading: true, onmore: vi.fn() });

  const button = screen.getByRole("button", { name: /load more/ });
  expect(button.getAttribute("aria-busy")).toBe("true");
  // The label and the mark share one cell, so the wider of them sets the width.
  expect(button.textContent).toContain("load more");
  expect(button.querySelector("[data-asking]")).not.toBeNull();
});
