import { config } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derived, writable } from "./observable";

describe("the subscribe contract", () => {
  it("calls back at once with the current value", () => {
    const seen = vi.fn();

    writable(1).changes.subscribe(seen);

    expect(seen).toHaveBeenCalledWith(1);
  });

  it("calls back on every change until unsubscribed", () => {
    const store = writable(1);
    const seen = vi.fn();

    const held = store.changes.subscribe(seen);
    store.set(2);
    held.unsubscribe();
    store.set(3);

    expect(seen.mock.calls.flat()).toEqual([1, 2]);
  });

  it("survives a subscriber that unsubscribes while being notified", () => {
    const store = writable(1);
    const seen = vi.fn();

    const held = store.changes.subscribe((value) => {
      seen(value);
      if (value === 2) held.unsubscribe();
    });
    store.set(2);
    store.set(3);

    expect(seen.mock.calls.flat()).toEqual([1, 2]);
  });

  it("projects a derived value on subscribe and on change", () => {
    const store = writable(1);
    const seen = vi.fn();

    derived(store.changes, (value) => value * 10).subscribe(seen);
    store.set(2);

    expect(seen.mock.calls.flat()).toEqual([10, 20]);
  });
});

describe("what a shell cannot do to a surface", () => {
  const reported = vi.fn();
  const held = config.onUnhandledError;

  beforeEach(() => {
    reported.mockReset();
    config.onUnhandledError = reported;
  });

  afterEach(() => {
    config.onUnhandledError = held;
  });

  it("hands out no way to end one", () => {
    const surface: object = writable(1).changes;

    expect("error" in surface).toBe(false);
    expect("complete" in surface).toBe(false);
  });

  /** rxjs reports an isolated error on a later turn; catch it before it escapes. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("keeps notifying the others when one subscriber throws", async () => {
    const store = writable(1);
    const after = vi.fn();

    store.changes.subscribe(() => {
      throw new Error("a shell blew up");
    });
    store.changes.subscribe(after);
    store.set(2);
    await settled();

    expect(after.mock.calls.flat()).toEqual([1, 2]);
    expect(store.get()).toBe(2);
    // Isolated, not swallowed: the shell's bug is still reported.
    expect(reported).toHaveBeenCalled();
  });

  it("keeps the surface alive after a subscriber has thrown", async () => {
    const store = writable(1);
    const seen = vi.fn();

    store.changes.subscribe((value) => {
      if (value === 2) throw new Error("a shell blew up");
    });
    store.set(2);
    store.changes.subscribe(seen);
    store.set(3);
    await settled();

    expect(seen.mock.calls.flat()).toEqual([2, 3]);
  });
});

describe("a derived surface", () => {
  it("does not recompute when an unrelated part of the source changes", () => {
    const store = writable({ wanted: 1, other: 1 });
    const project = vi.fn((value: { wanted: number }) => value.wanted);

    const seen = vi.fn();
    derived(store.changes, project).subscribe(seen);
    store.set({ wanted: 1, other: 2 });

    expect(project).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls.flat()).toEqual([1]);
  });
});
