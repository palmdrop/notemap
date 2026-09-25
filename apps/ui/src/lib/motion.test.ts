import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  bezier,
  duration,
  fade,
  following,
  grow,
  growing,
  revealed,
  rise,
  slide,
  unfold,
  widen,
} from "./motion";

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

test("a fade eases evenly, and what travels decelerates", () => {
  root.style.setProperty("--ease-motion", "cubic-bezier(0.2, 0, 0, 1)");
  root.style.setProperty("--ease-fade", "cubic-bezier(0.4, 0, 0.6, 1)");
  const node = document.createElement("div");

  const faded = fade(node).easing!;
  const slid = slide(node).easing!;

  expect(faded(0.5)).toBeCloseTo(0.5, 2);
  expect(faded(0.1)).toBeLessThan(0.1);
  expect(slid(0.1)).toBeGreaterThan(faded(0.1) * 3);

  root.style.removeProperty("--ease-motion");
  root.style.removeProperty("--ease-fade");
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
    const running = { cancel: vi.fn() };
    const getAnimations = vi.fn(() => [running]);
    Object.assign(node, { animate, getAnimations });
    return { node, animate, running };
  }

  test("turns a box already growing toward the new height from where it stands", () => {
    root.style.setProperty("--duration-short", "150ms");
    const { node, animate, running } = box(200);

    grow(node, 120);

    expect(running.cancel).toHaveBeenCalled();
    const [frames] = animate.mock.calls[0] as [{ height: string }[]];
    expect(frames.map((frame) => frame.height)).toEqual(["120px", "200px"]);
  });

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

describe("unfold", () => {
  function within(direction: string) {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    parent.style.flexDirection = direction;
    const node = document.createElement("span");
    parent.append(node);
    document.body.append(parent);
    return node;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  test("runs across a row of neighbours, and down where they stack", () => {
    root.style.setProperty("--duration-short", "150ms");

    expect(unfold(within("row")).css?.(0.5, 0.5)).toContain("width");
    expect(unfold(within("column")).css?.(0.5, 0.5)).toContain("height");
  });

  test("is short", () => {
    root.style.setProperty("--duration-short", "150ms");
    root.style.setProperty("--duration-long", "220ms");
    expect(unfold(within("row")).duration).toBe(150);
  });
});

test("widening caps the width at the share of it the moment has reached", () => {
  root.style.setProperty("--duration-short", "150ms");
  const node = document.createElement("div");
  node.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;

  const opening = widen(node);

  expect(opening.duration).toBe(150);
  expect(opening.css?.(0.5, 0.5)).toContain("max-width: 100px");
  expect(opening.css?.(0, 1)).toContain("min-width: 0");
});

describe("revealed", () => {
  test("marks a picture already held at once, and one still coming when it lands", () => {
    const held = document.createElement("img");
    Object.defineProperty(held, "complete", { value: true });
    Object.defineProperty(held, "naturalWidth", { value: 10 });
    revealed(held);
    expect(held.dataset["loaded"]).toBe("");

    const coming = document.createElement("img");
    revealed(coming);
    expect(coming.dataset["loaded"]).toBeUndefined();
    coming.dispatchEvent(new Event("load"));
    expect(coming.dataset["loaded"]).toBe("");
  });
});

describe("growing", () => {
  let told: (() => void) | undefined;

  function box() {
    const node = document.createElement("div");
    let size = { height: 100, width: 400 };
    Object.defineProperty(node, "offsetHeight", { get: () => size.height });
    Object.defineProperty(node, "offsetWidth", { get: () => size.width });
    const animate = vi.fn();
    let running: Animation[] = [];
    Object.assign(node, { animate, getAnimations: () => running });
    return {
      node,
      animate,
      resize(next: Partial<typeof size>) {
        size = { ...size, ...next };
        told?.();
      },
      moving(yes: boolean) {
        running = yes
          ? [{ finished: new Promise(() => undefined) } as unknown as Animation]
          : [];
      },
    };
  }

  beforeEach(() => {
    root.style.setProperty("--duration-short", "150ms");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          told = callback;
        }
        observe() {
          told?.();
        }
        disconnect() {
          told = undefined;
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  test("grows and shrinks from the height it had, and not on first sight", () => {
    const { node, animate, resize } = box();
    growing(node);
    expect(animate).not.toHaveBeenCalled();

    resize({ height: 160 });
    resize({ height: 120 });

    const froms = animate.mock.calls.map(
      ([frames]) => (frames as { height: string }[])[0]?.height,
    );
    expect(froms).toEqual(["100px", "160px"]);
  });

  test("a change of width is the window's, and moves nothing", () => {
    const { node, animate, resize } = box();
    growing(node);

    resize({ height: 140, width: 300 });
    expect(animate).not.toHaveBeenCalled();
  });

  test("leaves a box that is already moving to finish", () => {
    const { node, animate, resize, moving } = box();
    growing(node);

    moving(true);
    resize({ height: 180 });
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("following", () => {
  let told: (() => void) | undefined;

  function box() {
    const node = document.createElement("div");
    const content = document.createElement("div");
    node.append(content);
    let size = { height: 100, width: 400 };
    let standing = 100;
    Object.defineProperty(content, "offsetHeight", { get: () => size.height });
    Object.defineProperty(content, "offsetWidth", { get: () => size.width });
    Object.defineProperty(node, "offsetHeight", { get: () => size.height });
    node.getBoundingClientRect = () => ({ height: standing }) as DOMRect;
    const animate = vi.fn();
    let running: { cancel: () => void }[] = [];
    Object.assign(node, { animate, getAnimations: () => running });
    return {
      node,
      animate,
      resize(next: Partial<typeof size>) {
        size = { ...size, ...next };
        told?.();
      },
      midway(at: number) {
        standing = at;
        running = [{ cancel: vi.fn() }];
      },
    };
  }

  const froms = (animate: ReturnType<typeof vi.fn>) =>
    animate.mock.calls.map(([frames]) =>
      (frames as { height: string }[]).map((one) => one.height),
    );

  beforeEach(() => {
    root.style.setProperty("--duration-short", "150ms");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          told = callback;
        }
        observe() {
          told?.();
        }
        disconnect() {
          told = undefined;
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  test("grows the box from what its content was to what it is, and not on first sight", () => {
    const { node, animate, resize } = box();
    following(node);
    expect(animate).not.toHaveBeenCalled();

    resize({ height: 240 });

    expect(froms(animate)).toEqual([["100px", "240px"]]);
  });

  test("a change landing mid-way turns the box from where it stands", () => {
    const { node, animate, resize, midway } = box();
    following(node);

    resize({ height: 240 });
    midway(170);
    resize({ height: 60 });

    expect(froms(animate).at(-1)).toEqual(["170px", "60px"]);
  });

  test("a change of width is the window's, and moves nothing", () => {
    const { node, animate, resize } = box();
    following(node);

    resize({ height: 180, width: 300 });
    expect(animate).not.toHaveBeenCalled();
  });
});
