import { expect, test, vi } from "vitest";

import type { ListState } from "@notemap/client";

import { readPast, settled } from "./paging";

/** Calls back at once with what it holds, as the client's surfaces do. */
function surface(state: Partial<ListState> = {}) {
  let held: ListState = {
    items: [],
    order: "newest-first",
    loading: false,
    more: true,
    fromCache: false,
    ...state,
  };
  const watching = new Set<(state: ListState) => void>();

  return {
    get observed() {
      return watching.size > 0;
    },
    getValue: () => held,
    next(state: ListState) {
      held = state;
      for (const next of [...watching]) next(held);
    },
    subscribe(next: (state: ListState) => void) {
      watching.add(next);
      next(held);
      return { unsubscribe: () => watching.delete(next) };
    },
  };
}

test("a surface that is not reading has already settled", async () => {
  const held = surface();
  await expect(settled(held)).resolves.toMatchObject({ loading: false });
  expect(held.observed).toBe(false);
});

test("a surface reading settles when its read lands", async () => {
  const held = surface({ loading: true });
  let landed = false;
  void settled(held).then(() => (landed = true));

  await Promise.resolve();
  expect(landed).toBe(false);

  held.next({ ...held.getValue(), loading: false });
  await vi.waitFor(() => {
    expect(landed).toBe(true);
  });
  expect(held.observed).toBe(false);
});

test("reads on only where it is still wanted, there is more, and nothing failed", async () => {
  const load = vi.fn(() => Promise.resolve());

  await readPast(surface(), load, () => false);
  await readPast(surface({ more: false }), load, () => true);
  await readPast(
    surface({ failure: { said: "no", refused: true } }),
    load,
    () => true,
  );
  expect(load).not.toHaveBeenCalled();

  let wanted = true;
  const once = vi.fn(() => {
    wanted = false;
    return Promise.resolve();
  });
  await readPast(surface(), once, () => wanted);
  expect(once).toHaveBeenCalledTimes(1);
});

test("a load that answered nothing yet is followed until the step is had", async () => {
  const held = surface();
  let asks = 0;
  let wanted = true;

  // The first ask finds a read already queued and resolves before it lands.
  const load = vi.fn(() => {
    asks += 1;
    if (asks === 1) {
      held.next({ ...held.getValue(), loading: true });
      setTimeout(() => {
        wanted = false;
        held.next({ ...held.getValue(), loading: false });
      }, 0);
    }
    return Promise.resolve();
  });

  await readPast(held, load, () => wanted);
  expect(load).toHaveBeenCalledTimes(1);
});
