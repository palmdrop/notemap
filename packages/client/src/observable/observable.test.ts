import { describe, expect, it, vi } from "vitest";

import { derived, writable } from "./observable";

describe("the subscribe contract", () => {
  it("calls back at once with the current value", () => {
    const seen = vi.fn();

    writable(1).subscribe(seen);

    expect(seen).toHaveBeenCalledWith(1);
  });

  it("calls back on every change until unsubscribed", () => {
    const store = writable(1);
    const seen = vi.fn();

    const stop = store.subscribe(seen);
    store.set(2);
    stop();
    store.set(3);

    expect(seen.mock.calls.flat()).toEqual([1, 2]);
  });

  it("survives a subscriber that unsubscribes while being notified", () => {
    const store = writable(1);
    const seen = vi.fn();

    const stop = store.subscribe((value) => {
      seen(value);
      if (value === 2) stop();
    });
    store.set(2);
    store.set(3);

    expect(seen.mock.calls.flat()).toEqual([1, 2]);
  });

  it("projects a derived value on subscribe and on change", () => {
    const store = writable(1);
    const seen = vi.fn();

    derived(store, (value) => value * 10).subscribe(seen);
    store.set(2);

    expect(seen.mock.calls.flat()).toEqual([10, 20]);
  });
});
