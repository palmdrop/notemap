import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { published } from "./stack.svelte";
import Fixture from "./stack.fixture.svelte";

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
