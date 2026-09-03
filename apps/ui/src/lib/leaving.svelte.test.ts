import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { anItem } from "@notemap/client/testing";

import { leaving } from "./leaving.svelte";

beforeEach(() => {
  vi.useFakeTimers();
  leaving.clear();
});

afterEach(() => {
  vi.useRealTimers();
  leaving.clear();
});

function asks(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
}

test("a row goes after one beat, and not before", () => {
  asks(false);
  leaving.after(anItem("one"), "routed", "two");

  expect(leaving.going()).toHaveLength(1);
  expect(leaving.going()[0]?.word).toBe("routed");
  expect(leaving.going()[0]?.before).toBe("two");

  vi.advanceTimersByTime(2_000);
  expect(leaving.going()).toHaveLength(0);
});

/** Less movement means none: the row goes at once rather than lingering briefly. */
test("a reader who asked for stillness watches nothing leave", () => {
  asks(true);
  leaving.after(anItem("one"), "routed");

  expect(leaving.going()).toHaveLength(0);
});
