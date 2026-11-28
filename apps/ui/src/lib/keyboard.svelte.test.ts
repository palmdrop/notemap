import { afterEach, expect, test, vi } from "vitest";

import { viewport } from "$testing/dom";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function field(type = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  document.body.append(input);
  return input;
}

/** The view as a phone reports it, resizable by the test. */
function view(height: number) {
  const seen = Object.assign(new EventTarget(), { height, offsetTop: 0 });
  vi.stubGlobal("visualViewport", seen);
  return (to: number) => {
    seen.height = to;
    seen.dispatchEvent(new Event("resize"));
  };
}

async function fresh() {
  vi.resetModules();
  return (await import("./keyboard.svelte")).keyboard;
}

test("is up on a phone while a field that types has the focus, and down once it leaves", async () => {
  viewport(390);
  const keyboard = await fresh();
  const input = field();

  input.focus();
  expect(keyboard.up).toBe(true);

  input.blur();
  expect(keyboard.up).toBe(false);
});

test("is never up for a box that does not type, nor when wide", async () => {
  viewport(390);
  const keyboard = await fresh();

  field("checkbox").focus();
  expect(keyboard.up).toBe(false);

  viewport(1024);
  field().focus();
  expect(keyboard.up).toBe(false);
});

test("is down once the view is its full height again, though the field keeps the focus", async () => {
  viewport(390);
  const resize = view(800);
  const keyboard = await fresh();
  const input = field();

  input.focus();
  expect(keyboard.up).toBe(false);

  resize(460);
  expect(keyboard.up).toBe(true);

  resize(800);
  expect(document.activeElement).toBe(input);
  expect(keyboard.up).toBe(false);
});
