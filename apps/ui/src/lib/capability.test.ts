import { expect, test } from "vitest";

import { carriesAssets, didWhat } from "./capability";

test("a capability carrying the attachments alone says so in its schema", () => {
  expect(
    carriesAssets({ argumentsSchema: { "x-notemap-carries": "assets" } }),
  ).toBe(true);
  expect(carriesAssets({ argumentsSchema: { type: "object" } })).toBe(false);
  expect(carriesAssets({})).toBe(false);
});

test("placing the attachments reads as placed", () => {
  expect(didWhat("place-assets")).toBe("placed");
});
