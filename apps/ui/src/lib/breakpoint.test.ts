import { expect, test } from "vitest";

import { viewport } from "$testing/dom";
import { narrow } from "./breakpoint";

test("is narrow below the token's 44rem, and not at or above it", () => {
  viewport(1024);
  expect(narrow()).toBe(false);

  viewport(704);
  expect(narrow()).toBe(false);

  viewport(703);
  expect(narrow()).toBe(true);
});
