import { expect, test } from "vitest";

import { anItem } from "@notemap/client/testing";

import { placeOf } from "./held";

const at = (hour: number) =>
  `2026-09-12T${String(hour).padStart(2, "0")}:00:00.000Z`;
const one = anItem("one", { createdAt: at(8) });
const two = anItem("two", { createdAt: at(9) });
const three = anItem("three", { createdAt: at(10) });

test("puts a row back where the order reads it, either way round", () => {
  expect(placeOf([one, three], two, "oldest-first")).toBe(1);
  expect(placeOf([three, one], two, "newest-first")).toBe(1);
});

test("puts a row past every other at the end", () => {
  expect(placeOf([one, two], three, "oldest-first")).toBe(2);
  expect(placeOf([], three, "newest-first")).toBe(0);
});
