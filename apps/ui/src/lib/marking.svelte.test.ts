import { expect, test } from "vitest";

import { Marking, PLAINLY, picked } from "./marking.svelte";

const ROWS = ["one", "two", "three", "four"];
const TOGGLE = { toggle: true, range: false };
const RANGE = { toggle: false, range: true };

test("a plain pick outside the mode is the surface's own", () => {
  const marking = new Marking();

  expect(picked(marking, ROWS, "two", PLAINLY, "one")).toBeUndefined();
  expect(marking.on).toBe(false);
});

test("a pick with mod held enters the mode, marking the row already selected too", () => {
  const marking = new Marking();

  expect(picked(marking, ROWS, "three", TOGGLE, "one")).toBe("three");

  expect(marking.on).toBe(true);
  expect(marking.inOrder(ROWS.map((id) => ({ id })))).toEqual(["one", "three"]);
});

test("in the mode a plain pick toggles without letting go of the others", () => {
  const marking = new Marking();
  picked(marking, ROWS, "one", TOGGLE, undefined);

  picked(marking, ROWS, "two", PLAINLY, "one");
  picked(marking, ROWS, "one", PLAINLY, "two");

  expect(marking.has("one")).toBe(false);
  expect(marking.has("two")).toBe(true);
});

test("a pick with shift held marks every row from the selected one", () => {
  const marking = new Marking();

  picked(marking, ROWS, "three", RANGE, "one");

  expect(marking.inOrder(ROWS.map((id) => ({ id })))).toEqual([
    "one",
    "two",
    "three",
  ]);
});

test("a range in the mode runs from the row last toggled", () => {
  const marking = new Marking();
  picked(marking, ROWS, "four", TOGGLE, undefined);

  picked(marking, ROWS, "two", RANGE, "four");

  expect(marking.inOrder(ROWS.map((id) => ({ id })))).toEqual([
    "two",
    "three",
    "four",
  ]);
});

test("unmarking the last row leaves the mode, as clearing does", () => {
  const marking = new Marking();
  marking.toggle("one");
  marking.toggle("one");

  expect(marking.on).toBe(false);

  marking.toggle("two");
  marking.clear();
  expect(marking.on).toBe(false);
});

test("a marked row no longer drawn is let go of", () => {
  const marking = new Marking();
  marking.toggle("one");
  marking.toggle("two");

  marking.keepOnly(["two"]);

  expect(marking.count).toBe(1);
  expect(marking.has("two")).toBe(true);
});
