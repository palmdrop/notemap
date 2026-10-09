import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import Anchored from "./anchored.fixture.svelte";

type Seen = { item: string; still: boolean }[];

/** Rows a hundred pixels tall, stacked in document order, under a window scrolled to `scrolled`. */
const ROW = 100;
let scrolled = 0;

beforeEach(() => {
  scrolled = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrolled);
  vi.spyOn(window, "scrollBy").mockImplementation(((_: number, by: number) => {
    scrolled += by;
  }) as typeof window.scrollBy);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const rows = [...document.querySelectorAll("[data-row]")];
      const top = rows.indexOf(this) * ROW - scrolled;
      return { top, bottom: top + ROW } as DOMRect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function drawn(items: readonly string[], seen: Seen) {
  const shown = render(Anchored, { items, seen });
  await tick();
  return async (next: readonly string[], reading = false) => {
    await shown.rerender({ items: next, reading, seen });
    await tick();
    await tick();
  };
}

test("holds the row in view where it stood while one arrives above it, and the arrival is still", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two", "three", "four"], seen);
  scrolled = 250;
  seen.length = 0;

  await next(["zero", "one", "two", "three", "four"]);

  expect(scrolled).toBe(350);
  expect(seen).toEqual([{ item: "zero", still: true }]);
});

test("moves nothing for a row arriving below the reader, which slides", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two", "three"], seen);
  scrolled = 50;
  seen.length = 0;

  await next(["one", "two", "three", "four"]);

  expect(scrolled).toBe(50);
  expect(seen).toEqual([{ item: "four", still: false }]);
});

test("leaves a reader at the head to watch a row arrive", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two"], seen);
  seen.length = 0;

  await next(["zero", "one", "two"]);

  expect(scrolled).toBe(0);
  expect(window.scrollBy).not.toHaveBeenCalled();
  expect(seen).toEqual([{ item: "zero", still: false }]);
});

test("leaves a read to place the reader itself", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two", "three"], seen);
  scrolled = 150;

  await next(["zero", "one", "two", "three"], true);

  expect(window.scrollBy).not.toHaveBeenCalled();
});

test("slides an arrival above the reader again once the update has passed", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two", "three"], seen);
  scrolled = 150;
  await next(["zero", "one", "two", "three"]);
  scrolled = 0;
  seen.length = 0;

  await next(["zero", "one", "two", "three", "four"]);

  expect(seen).toEqual([{ item: "four", still: false }]);
});
