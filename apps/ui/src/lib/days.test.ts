import { expect, test } from "vitest";

import { byDay, plain } from "./days";
import { weekdayOf } from "./stamp";

const at = (day: number, hour: number) =>
  new Date(2026, 8, day, hour).toISOString();

const row = (id: string, day: number, hour: number) => ({
  id,
  createdAt: at(day, hour),
});

const read = (drawn: ReturnType<typeof byDay>) =>
  drawn.map((one) =>
    one.kind === "day" ? one.key : `${one.key}${one.opens ? "*" : ""}`,
  );

test("heads the first row of each day, oldest first", () => {
  expect(
    read(byDay([row("a", 11, 9), row("b", 11, 16), row("c", 12, 8)])),
  ).toEqual(["day:2026-09-11", "a*", "b", "day:2026-09-12", "c*"]);
});

test("heads the first row of each day, newest first", () => {
  expect(
    read(byDay([row("c", 12, 8), row("b", 11, 16), row("a", 11, 9)])),
  ).toEqual(["day:2026-09-12", "c*", "day:2026-09-11", "b*", "a"]);
});

test("keys a heading by its day, so it stays put as the rows under it go", () => {
  const before = byDay([row("a", 11, 9), row("b", 11, 16)]);
  const after = byDay([row("b", 11, 16)]);

  expect(before[0]?.key).toBe(after[0]?.key);
  expect(read(after)).toEqual(["day:2026-09-11", "b*"]);
});

test("gives a day read twice out of order a key of its own", () => {
  const keys = byDay([row("a", 11, 9), row("b", 12, 8), row("c", 11, 16)]).map(
    (one) => one.key,
  );

  expect(new Set(keys).size).toBe(keys.length);
});

test("draws no headings on the rail", () => {
  expect(read(plain([row("a", 11, 9), row("b", 12, 8)]))).toEqual(["a", "b"]);
});

test("names the weekday, lowercase", () => {
  expect(weekdayOf(at(13, 12))).toBe("sunday");
});
