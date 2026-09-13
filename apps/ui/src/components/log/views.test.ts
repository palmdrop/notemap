import { expect, test } from "vitest";

import { kindsIn, viewOf, VIEWS } from "./views";

test("reads the kinds a URL names, and nothing where it names none", () => {
  expect(kindsIn(new URL("http://shell/log?kind=routed,tagged"))).toEqual([
    "routed",
    "tagged",
  ]);
  expect(kindsIn(new URL("http://shell/log"))).toBeUndefined();
  expect(kindsIn(new URL("http://shell/log?kind="))).toBeUndefined();
});

test("names the view a set of kinds is, whatever order they come in", () => {
  const routing = VIEWS.find((view) => view.name === "routing");
  expect(viewOf([...(routing?.kinds ?? [])].reverse())?.name).toBe("routing");
});

test("names no view for kinds that are not exactly one of them", () => {
  expect(viewOf(["routed"])).toBeUndefined();
  expect(viewOf(undefined)).toBeUndefined();
});
