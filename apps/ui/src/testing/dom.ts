import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/svelte";

/**
 * jsdom lays nothing out, so it implements neither scrolling nor a scroll
 * offset. A component that restores a scroll mark still calls both.
 */
function stubScrolling(): void {
  window.scrollTo = vi.fn();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
}

/** What the browser says about reachability, which jsdom fixes at `true`. */
export function online(yes: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: yes,
  });
  window.dispatchEvent(new Event(yes ? "online" : "offline"));
}

beforeEach(() => {
  stubScrolling();
  online(true);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
