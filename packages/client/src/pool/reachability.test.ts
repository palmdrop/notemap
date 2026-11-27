import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { reachability } from "./reachability";

const now = () => new Date().toISOString();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A probe that answers as told, and records whether each ask was a quick one. */
function probing(answers: () => boolean) {
  const quick: boolean[] = [];
  const reach = reachability((asked) => {
    quick.push(asked);
    return Promise.resolve({ yes: answers() });
  }, now);
  return { reach, quick };
}

it("asks quickly on start, and patiently on a steady tick while the pool answers", async () => {
  const { reach, quick } = probing(() => true);

  await reach.ask();
  await vi.advanceTimersByTimeAsync(10_000);
  await vi.advanceTimersByTimeAsync(10_000);

  expect(quick).toEqual([true, false, false]);
  reach.stop();
});

it("asks quickly while the pool is out of reach, to notice it come back", async () => {
  const { reach, quick } = probing(() => false);

  await reach.ask();
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.advanceTimersByTimeAsync(2_000);

  expect(quick).toEqual([true, true, true]);
  reach.stop();
});

it("asks quickly when looked at again, however long it answered before", async () => {
  const { reach, quick } = probing(() => true);

  await reach.ask();
  reach.watched(false);
  reach.watched(true);
  await vi.advanceTimersByTimeAsync(0);

  expect(quick).toEqual([true, true]);
  reach.stop();
});
