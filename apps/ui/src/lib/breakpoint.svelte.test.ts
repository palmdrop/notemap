import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import { viewport } from "$testing/dom";
import { width } from "./breakpoint";

afterEach(() => {
  viewport(1024);
  vi.restoreAllMocks();
});

test("a reader is woken by crossing a breakpoint, and not by a resize within one", () => {
  viewport(1024);
  const seen: boolean[] = [];
  const cleanup = $effect.root(() => {
    $effect(() => {
      seen.push(width.wide);
    });
  });
  flushSync();

  viewport(1000);
  flushSync();
  viewport(899);
  flushSync();
  viewport(600);
  flushSync();
  viewport(950);
  flushSync();

  expect(seen).toEqual([true, false, true]);
  cleanup();
});

test("reads the window once per resize however many readers there are", () => {
  viewport(1024);
  const cleanup = $effect.root(() => {
    for (let reader = 0; reader < 20; reader += 1) {
      $effect(() => {
        void width.wide;
        void width.full;
      });
    }
  });
  flushSync();

  const reads = vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
  window.dispatchEvent(new Event("resize"));
  flushSync();

  expect(reads).toHaveBeenCalledTimes(1);
  cleanup();
});

test("a read with nobody listening is the window's width now", () => {
  viewport(1024);
  expect(width.wide).toBe(true);
  viewport(800);
  expect(width.wide).toBe(false);
});
