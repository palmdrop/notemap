import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { anItem } from "@notemap/client/testing";

import { lingering } from "./lingering.svelte";

beforeEach(() => {
  vi.useFakeTimers();
  lingering.clear();
});

afterEach(() => {
  vi.useRealTimers();
  lingering.clear();
});

function asks(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
}

test("a row goes after one beat, and not before", () => {
  asks(false);
  lingering.after(anItem("one"), "routed", "two");

  expect(lingering.going()).toHaveLength(1);
  expect(lingering.going()[0]?.word).toBe("routed");
  expect(lingering.going()[0]?.before).toBe("two");

  vi.advanceTimersByTime(2_000);
  expect(lingering.going()).toHaveLength(0);
});

/** Less movement means none: the row goes at once rather than lingering briefly. */
test("a reader who asked for stillness watches nothing leave", () => {
  asks(true);
  lingering.after(anItem("one"), "routed");

  expect(lingering.going()).toHaveLength(0);
});
