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

/**
 * Node ships a `localStorage` of its own that is inert without a command-line
 * flag, and it shadows the one jsdom would have given. Stubbed at module scope
 * because a module that reads it as it loads runs before any `beforeEach`.
 */
function stubStorage(): void {
  const held = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return held.size;
    },
    key: (at) => [...held.keys()][at] ?? null,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, String(value)),
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

stubStorage();

/** Nothing is ever laid out here, so nothing ever resizes either. */
function stubResizing(): void {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/**
 * What a clamped element would report if the browser had laid it out: how tall
 * its content is against how tall it is allowed to be, and one line's height.
 */
export function overflowing(content: number, box: number, line: number): void {
  for (const [name, value] of [
    ["scrollHeight", content],
    ["clientHeight", box],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value,
    });
  }

  const measured = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (element, pseudo) =>
      new Proxy(measured(element, pseudo), {
        get: (held, key) =>
          key === "lineHeight" ? `${line}px` : Reflect.get(held, key),
      }) as CSSStyleDeclaration,
  );
}

/** What the browser says about reachability, which jsdom fixes at `true`. */
export function online(yes: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: yes,
  });
  window.dispatchEvent(new Event(yes ? "online" : "offline"));
}

/** Whether the page is being looked at, which jsdom fixes at visible. */
export function looking(yes: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: yes ? "visible" : "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  stubScrolling();
  stubResizing();
  online(true);
  looking(true);
  sessionStorage.clear();
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
