import { afterEach, expect, test } from "vitest";

import { keepPlace, readMark } from "./scroll-mark";

function scrolledTo(y: number, event: "scroll" | "scrollend"): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event(event));
}

afterEach(() => {
  sessionStorage.clear();
  scrolledTo(0, "scroll");
});

test("keeps the place a scroll comes to rest at, and not each step of the way", () => {
  const stop = keepPlace("queue");

  scrolledTo(400, "scroll");
  scrolledTo(800, "scroll");
  expect(readMark("queue")).toBe(0);

  scrolledTo(800, "scrollend");
  expect(readMark("queue")).toBe(800);
  stop();
});

test("keeps the place on every scroll where the browser never says one ended", () => {
  const said = Object.getOwnPropertyDescriptor(window, "onscrollend");
  Reflect.deleteProperty(window, "onscrollend");
  try {
    const stop = keepPlace("feed");
    scrolledTo(300, "scroll");
    expect(readMark("feed")).toBe(300);
    stop();
  } finally {
    if (said !== undefined) {
      Object.defineProperty(window, "onscrollend", said);
    }
  }
});

test("a surface no longer drawn keeps nothing", () => {
  keepPlace("queue")();

  scrolledTo(500, "scrollend");
  expect(readMark("queue")).toBe(0);
});
