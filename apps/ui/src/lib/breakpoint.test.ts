import { expect, test } from "vitest";

import { viewport } from "$testing/dom";
import { full, wide } from "./breakpoint";

test("is wide from the token's 900px, and not below it", () => {
  viewport(1024);
  expect(wide()).toBe(true);

  viewport(900);
  expect(wide()).toBe(true);

  viewport(899);
  expect(wide()).toBe(false);
});

test("is full from 1200px, where the menu is a column", () => {
  viewport(1200);
  expect(full()).toBe(true);

  viewport(1199);
  expect(full()).toBe(false);
});

test("asks the window its width once a resize, not once a read", () => {
  viewport(390);
  let asked = 0;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => {
      asked += 1;
      return 390;
    },
  });

  for (let read = 0; read < 10; read += 1) wide();
  expect(asked).toBe(0);

  window.dispatchEvent(new Event("resize"));
  expect(asked).toBe(1);
});
