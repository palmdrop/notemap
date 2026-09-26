import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Asking, { SHOWN_AFTER, SLOW_AFTER } from "./Asking.svelte";
import Pending from "./Pending.svelte";
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
  const [day, between, time] = [...(written?.children ?? [])];
  expect(day?.tagName).toBe("TIME");
  // The space between is a thing of its own, for no reader to read.
  expect(between?.getAttribute("aria-hidden")).toBe("true");
  expect(between?.textContent).toBe("");
  expect(time?.textContent).toBe("11:14");
});

test("says what became of an item, in one word", () => {
  render(StateWord, { word: "archived" });
  expect(screen.getByText("archived")).toBeDefined();
});

describe("the asking mark", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("holds its line hidden, so a quick answer draws nothing and a slow one moves nothing", async () => {
    render(Asking);
    const mark = screen.getByRole("status", { hidden: true });
    expect(mark.dataset["asking"]).toBe("hidden");

    await vi.advanceTimersByTimeAsync(SHOWN_AFTER - 1);
    expect(mark.dataset["asking"]).toBe("hidden");

    await vi.advanceTimersByTimeAsync(1);
    expect(mark.dataset["asking"]).toBe("shown");
  });

  test("says no word on screen, only to a reader that cannot see it", async () => {
    render(Asking);
    await vi.advanceTimersByTimeAsync(SLOW_AFTER);
    expect(screen.getByText("loading").className).toContain("sr-only");
  });

  test("names a subject that is slow to answer, and only once it is", async () => {
    render(Asking, { subject: "nas" });
    await vi.advanceTimersByTimeAsync(SLOW_AFTER - 1);
    expect(screen.queryByText("nas is slow to answer")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByText("nas is slow to answer")).toBeDefined();
  });

  test("stands still for a reader who asked for stillness", () => {
    const { container } = render(Asking);
    const squares = container.querySelectorAll("[aria-hidden] > span");
    expect(squares).toHaveLength(3);
    for (const square of squares) {
      expect(square.className).toContain("motion-reduce:animate-none");
    }
  });
});

describe("the pending mark", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("is not drawn for work that drains before the asking mark would show", async () => {
    render(Pending, { since: Date.now() });
    expect(screen.queryByText("pending")).toBeNull();

    await vi.advanceTimersByTimeAsync(SHOWN_AFTER - 1);
    expect(screen.queryByText("pending")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByText("pending")).toBeDefined();
  });

  /** Drawn again on every visit, it would grow its row a line each time. */
  test("is drawn at once for work that has already waited that long", () => {
    render(Pending, { since: Date.now() - SHOWN_AFTER });
    expect(screen.getByText("pending")).toBeDefined();
  });
});
