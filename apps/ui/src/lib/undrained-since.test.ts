import { afterEach, expect, test, vi } from "vitest";

import { undrainedSince } from "./undrained-since";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => vi.useRealTimers());

test("answers when the work was first asked about, however often it is asked", () => {
  vi.useFakeTimers();
  const first = undrainedSince("one");

  vi.advanceTimersByTime(400);

  expect(undrainedSince("one")).toBe(first);
  expect(undrainedSince("two")).toBe(first + 400);
});
