import { expect, test } from "vitest";

import { viewport } from "$testing/dom";
import { forgetRows, rows } from "./rows.svelte";

test("is auto until something is chosen, and auto again for a value it does not know", () => {
  expect(rows.choice).toBe("auto");

  localStorage.setItem("notemap:rows", "sideways");
  forgetRows();
  expect(rows.choice).toBe("auto");
});

test("reads a choice back from storage, as a reload does", () => {
  localStorage.setItem("notemap:rows", "by day");
  forgetRows();
  expect(rows.choice).toBe("by day");
});

test("auto reads by day on a narrow screen, with the rail slim, and the rail on a wide one", () => {
  viewport(1024);
  expect(rows.byDay).toBe(false);
  expect(rows.slim).toBe(false);

  viewport(390);
  expect(rows.byDay).toBe(true);
  expect(rows.slim).toBe(true);
});

test("by day heads the days at every width, and slims the rail only on a narrow screen", () => {
  rows.choose("by day");

  viewport(1024);
  expect(rows.byDay).toBe(true);
  expect(rows.slim).toBe(false);

  viewport(390);
  expect(rows.byDay).toBe(true);
  expect(rows.slim).toBe(true);
});

test("the rail is the rail at every width", () => {
  rows.choose("rail");

  for (const width of [390, 1024]) {
    viewport(width);
    expect(rows.byDay).toBe(false);
    expect(rows.slim).toBe(false);
  }
});
