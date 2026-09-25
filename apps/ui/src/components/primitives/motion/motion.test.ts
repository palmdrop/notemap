import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import Unfolding from "./Unfolding.fixture.svelte";

let watched: Element[] = [];

beforeEach(() => {
  watched = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(target: Element) {
        watched.push(target);
      }
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

/** A form whose fields change with a choice in it grows into them: what it holds is what its height follows. */
test("follows the height of what it holds, from the box around it", () => {
  render(Unfolding, { lines: 2 });

  const [held] = watched;
  expect(held?.textContent).toContain("line 0");
  expect(held?.textContent).toContain("line 1");
});

test("opens and shuts with the block it is in", async () => {
  const { rerender } = render(Unfolding, { open: true });
  expect(screen.getByText("line 0")).toBeDefined();

  await rerender({ open: false });
  expect(screen.queryByText("line 0")).toBeNull();
});
