import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { holding, published } from "./stack.svelte";
import Fixture from "./stack.fixture.svelte";
import Nested from "./stack.nested.fixture.svelte";

const ids = () =>
  published().flatMap((get) => get().map((command) => command.id));

test("publishes a layer on mount and drops it on destroy", () => {
  const { unmount } = render(Fixture, { id: "one" });
  expect(ids()).toEqual(["one"]);

  unmount();
  expect(ids()).toEqual([]);
});

/**
 * SvelteKit can hold the outgoing and the incoming page mounted at once, so
 * popping has to find its own layer rather than clobbering whichever one is
 * on top.
 */
test("pops the right layer by identity when two are mounted at once", () => {
  const first = render(Fixture, { id: "one" });
  const second = render(Fixture, { id: "two" });
  expect(ids()).toEqual(["one", "two"]);

  first.unmount();
  expect(ids()).toEqual(["two"]);

  second.unmount();
  expect(ids()).toEqual([]);
});

/**
 * A child mounts before its parent, so mount order alone would put the
 * surface drawn inside underneath the one drawing it.
 */
test("puts a nested surface above the one it is drawn inside", () => {
  render(Nested, { id: "outer", inside: "inner" });
  expect(ids()).toEqual(["outer", "inner"]);
});

/** An editable shape is the only way on until it is left. */
test("a layer that holds hides every layer beneath it", () => {
  render(Fixture, { id: "surface" });
  expect(holding()).toBe(false);

  const held = render(Fixture, { id: "draft", holds: true });
  expect(ids()).toEqual(["draft"]);
  expect(holding()).toBe(true);

  held.unmount();
  expect(ids()).toEqual(["surface"]);
  expect(holding()).toBe(false);
});
