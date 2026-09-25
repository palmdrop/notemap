import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, test } from "vitest";

import Moving from "./moving.fixture.svelte";

type Seen = { item: string; still: boolean }[];

async function drawn(items: readonly string[], seen: Seen) {
  const shown = render(Moving, { reading: false, items, seen });
  await tick();
  await tick();
  return async (reading: boolean, next: readonly string[]) => {
    await shown.rerender({ reading, items: next, seen });
    await tick();
    await tick();
  };
}

test("nothing moves on the first draw", async () => {
  const seen: Seen = [];
  await drawn(["one", "two"], seen);
  expect(seen.every((each) => each.still)).toBe(true);
});

test("a row that arrives or leaves between reads moves", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two"], seen);
  seen.length = 0;

  await next(false, ["one", "two", "three"]);
  await next(false, ["two", "three"]);

  expect(seen).toEqual([
    { item: "three", still: false },
    { item: "one", still: false },
  ]);
});

test("the rows a read brings in draw still, and the change after it moves again", async () => {
  const seen: Seen = [];
  const next = await drawn(["one"], seen);
  seen.length = 0;

  await next(true, ["one"]);
  await next(false, ["one", "two", "three"]);
  expect(seen).toEqual([
    { item: "two", still: true },
    { item: "three", still: true },
  ]);

  seen.length = 0;
  await next(false, ["one", "two", "three", "four"]);
  expect(seen).toEqual([{ item: "four", still: false }]);
});

test("a read that starts by clearing the list, as a turn does, drops the rows still", async () => {
  const seen: Seen = [];
  const next = await drawn(["one", "two"], seen);
  seen.length = 0;

  await next(true, []);
  expect(seen).toEqual([
    { item: "one", still: true },
    { item: "two", still: true },
  ]);
});
