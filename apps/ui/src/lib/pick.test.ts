import { afterEach, expect, test, vi } from "vitest";

import { doubled, pickable } from "./pick";

afterEach(() => {
  vi.restoreAllMocks();
});

/** What the browser hands a handler, of which only two fields are read here. */
function click(detail: number, target: Element = document.body): MouseEvent {
  return { detail, target } as unknown as MouseEvent;
}

/** A selection holding a word, which is what a double click on prose leaves. */
function selected(collapsed: boolean) {
  vi.spyOn(window, "getSelection").mockReturnValue({
    isCollapsed: collapsed,
  } as Selection);
}

test("opens on the first click of a gesture and on no other", () => {
  const open = vi.fn();
  const pick = pickable(open);

  pick(click(1));
  expect(open).toHaveBeenCalledTimes(1);

  // The second of a double is on its way somewhere and is not a toggle.
  pick(click(2));
  pick(click(3));
  expect(open).toHaveBeenCalledTimes(1);
});

test("leaves a click on a control to the control", () => {
  const open = vi.fn();
  const button = document.createElement("button");

  pickable(open)(click(1, button));

  expect(open).not.toHaveBeenCalled();
});

test("goes on a double the browser spent on nothing", () => {
  selected(true);
  const go = vi.fn();

  doubled(go)(click(2));

  expect(go).toHaveBeenCalledTimes(1);
});

/**
 * Double clicking a word in a capture is how a person takes it, and the row
 * leaving under a selection just made is not what they asked for.
 */
test("stays where a double click selected a word", () => {
  selected(false);
  const go = vi.fn();

  doubled(go)(click(2));

  expect(go).not.toHaveBeenCalled();
});
