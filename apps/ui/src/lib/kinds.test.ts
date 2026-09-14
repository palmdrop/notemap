import { expect, test } from "vitest";

import { kindWord } from "./kinds";

test("draws a hyphen as a space", () => {
  expect(kindWord("delivery-failed")).toBe("delivery failed");
  expect(kindWord("template-fired")).toBe("template fired");
  expect(kindWord("captured")).toBe("captured");
});

test("says discard where the pool says archive", () => {
  expect(kindWord("archived")).toBe("discarded");
  expect(kindWord("unarchived")).toBe("undiscarded");
});
