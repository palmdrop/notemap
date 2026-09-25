import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { bezier, duration, fade, grow, rise, slide } from "./motion";

const root = document.documentElement;

afterEach(() => {
  root.style.removeProperty("--duration-short");
  root.style.removeProperty("--duration-long");
});

describe("duration", () => {
  test("is zero without a stylesheet, so nothing animates under test", () => {
    expect(duration("short")).toBe(0);
    expect(duration("long")).toBe(0);
  });

  test("reads the token, in milliseconds or seconds", () => {
    root.style.setProperty("--duration-short", "150ms");
    root.style.setProperty("--duration-long", "0.25s");
    expect(duration("short")).toBe(150);
    expect(duration("long")).toBe(250);
  });

  test("a transition asked to stand still takes no time whatever the token says", () => {
    root.style.setProperty("--duration-long", "220ms");
    const node = document.createElement("div");
    expect(slide(node).duration).toBe(220);
    expect(slide(node, { still: true }).duration).toBe(0);
    expect(rise(node, { still: true }).duration).toBe(0);
  });

  test("a fade is short unless told otherwise", () => {
    root.style.setProperty("--duration-short", "150ms");
    root.style.setProperty("--duration-long", "220ms");
    const node = document.createElement("div");
    expect(fade(node).duration).toBe(150);
    expect(fade(node, { magnitude: "long" }).duration).toBe(220);
  });
});

test("a sliding fade ends on the opacity it asked for", () => {
  root.style.setProperty("--duration-long", "220ms");
  const css = slide(document.createElement("div"), { fade: true }).css;
  expect(css?.(0.5, 0.5)).toMatch(/min-height: 0;opacity: 0\.5$/);
});

describe("bezier", () => {
  test("pins its ends and is monotonic between them", () => {
    const curve = bezier("cubic-bezier(0.2, 0, 0, 1)")!;
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBe(1);
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map(curve);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
  });

  test("the linear curve is the identity", () => {
    const curve = bezier("cubic-bezier(0, 0, 1, 1)")!;
    expect(curve(0.5)).toBeCloseTo(0.5, 3);
  });

  test("anything else is not a curve", () => {
    expect(bezier("")).toBeUndefined();
    expect(bezier("ease-in")).toBeUndefined();
    expect(bezier("cubic-bezier(1, 2)")).toBeUndefined();
  });
});

test("reduced motion zeroes every duration the tokens name", () => {
  const tokens = readFileSync(
    join(process.cwd(), "src", "styles", "tokens.css"),
    "utf8",
  );
  const named = [...tokens.matchAll(/(--duration-[\w-]+):\s*\d/g)].map(
    ([, name]) => name,
  );
  const reduced = /prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(
    tokens,
  )?.[1];

  expect(named.length).toBeGreaterThan(0);
  for (const name of new Set(named)) {
    expect(reduced).toMatch(new RegExp(`${name}: 0ms`));
  }
});

describe("grow", () => {
  function box(height: number) {
    const node = document.createElement("div");
    Object.defineProperty(node, "offsetHeight", { value: height });
    const animate = vi.fn();
    Object.assign(node, { animate });
    return { node, animate };
  }

  test("grows a box from the height it had to the height it has", () => {
    root.style.setProperty("--duration-short", "150ms");
    const { node, animate } = box(200);

    grow(node, 80);

    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, timing] = animate.mock.calls[0] as [
      { height: string }[],
      { duration: number },
    ];
    expect(frames.map((frame) => frame.height)).toEqual(["80px", "200px"]);
    expect(timing.duration).toBe(150);
  });

  test("does nothing where nothing would move, or nothing is allowed to", () => {
    const { node, animate } = box(200);
    grow(node, 80);

    root.style.setProperty("--duration-short", "150ms");
    grow(node, 200);

    expect(animate).not.toHaveBeenCalled();
  });
});
