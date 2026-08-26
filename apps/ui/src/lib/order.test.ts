import { expect, test } from "vitest";

import { orderFor, remember, withOrder } from "./order";

const at = (query = "") => new URL(`http://localhost/${query}`);

test("starts each surface from the end it is defined by", () => {
  expect(orderFor("queue", at())).toBe("oldest-first");
  expect(orderFor("feed", at())).toBe("newest-first");
});

test("reads the order this shell was last told", () => {
  remember("queue", "newest-first");

  expect(orderFor("queue", at())).toBe("newest-first");
  // Two keys, so turning one surface around leaves the other where it was.
  expect(orderFor("feed", at())).toBe("newest-first");
  remember("feed", "oldest-first");
  expect(orderFor("queue", at())).toBe("newest-first");
});

test("takes the URL over what was remembered, so a shared read is the one shared", () => {
  remember("queue", "newest-first");

  expect(orderFor("queue", at("?order=oldest-first"))).toBe("oldest-first");
});

test("falls through an order that is not one", () => {
  expect(orderFor("queue", at("?order=sideways"))).toBe("oldest-first");

  remember("queue", "newest-first");
  expect(orderFor("queue", at("?order=sideways"))).toBe("newest-first");
});

test("names the order on a URL without disturbing the rest of it", () => {
  const url = withOrder(at("?furled=yes"), "newest-first");

  expect(url.searchParams.get("order")).toBe("newest-first");
  expect(url.searchParams.get("furled")).toBe("yes");
});
