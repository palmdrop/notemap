import { expect, test } from "vitest";

import { kindsIn, toggled, viewsIn, VIEWS } from "./views";

test("reads the kinds a URL names, and nothing where it names none", () => {
  expect(kindsIn(new URL("http://shell/log?kind=routed,tagged"))).toEqual([
    "routed",
    "tagged",
  ]);
  expect(kindsIn(new URL("http://shell/log"))).toBeUndefined();
  expect(kindsIn(new URL("http://shell/log?kind="))).toBeUndefined();
});

const named = (name: string) => {
  const view = VIEWS.find((one) => one.name === name);
  if (view === undefined) throw new Error(`no view ${name}`);
  return view;
};

test("takes as held only the views a set of kinds holds whole", () => {
  const routing = named("routing");
  expect(viewsIn([...routing.kinds].reverse())).toEqual([routing]);
  expect(viewsIn(["routed"])).toEqual([]);
  expect(viewsIn(undefined)).toEqual([]);
});

test("reads the union of the views taken, and everything once none is", () => {
  const routing = named("routing");
  const captures = named("captures");

  const both = toggled(routing.kinds, captures);
  expect(viewsIn(both)).toEqual([routing, captures]);
  expect(toggled(both, routing)).toEqual(captures.kinds);
  expect(toggled(captures.kinds, captures)).toBeUndefined();
});

/** A hand-written link named a kind no view holds whole; changing the reading drops it. */
test("lets go of a kind outside every view it holds once a view is taken", () => {
  const captures = named("captures");
  expect(toggled(["routed"], captures)).toEqual(captures.kinds);
});
