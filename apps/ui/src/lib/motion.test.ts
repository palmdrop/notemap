import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  arrive,
  bezier,
  markingHidden,
  drawOut,
  duration,
  fade,
  following,
  grow,
  leave,
  pinned,
  revealed,
  rise,
  settled,
  slide,
  unfold,
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

  test("a transition asked to stand still reads no style, as a page of rows mounts at once", () => {
    root.style.setProperty("--duration-short", "150ms");
    root.style.setProperty("--duration-long", "220ms");
    const parent = document.createElement("div");
    const node = document.createElement("div");
    parent.append(node);
    const styles = vi.spyOn(window, "getComputedStyle");
    const boxes = vi.spyOn(node, "getBoundingClientRect");

    for (const moving of [slide, fade, rise, arrive, unfold, leave]) {
      expect(moving(node, { still: true }).duration).toBe(0);
    }

    expect(styles).not.toHaveBeenCalled();
    expect(boxes).not.toHaveBeenCalled();
    styles.mockRestore();
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
  expect(
    Number(/opacity:\s*([\d.]+)\s*$/.exec(css?.(0.5, 0.5) ?? "")?.[1]),
  ).toBe(0.5);
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
    const running = { id: "growing", cancel: vi.fn() };
    const sliding = { id: "", cancel: vi.fn() };
    const getAnimations = vi.fn(() => [running, sliding]);
    Object.assign(node, { animate, getAnimations });
    return { node, animate, running, sliding };
  }

  test("turns a box already growing toward the new height from where it stands", () => {
    root.style.setProperty("--duration-short", "150ms");
    const { node, animate, running, sliding } = box(200);

    grow(node, 120);

    expect(running.cancel).toHaveBeenCalled();
    // A row slides in on the same box it grows on; that is the list's, not this.
    expect(sliding.cancel).not.toHaveBeenCalled();
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

test("drawing out clips what is not yet drawn, and never the box's size", () => {
  root.style.setProperty("--duration-short", "150ms");
  const node = document.createElement("div");

  const opening = drawOut(node);

  expect(opening.duration).toBe(150);
  expect(opening.css?.(0.25, 0.75)).toBe("clip-path: inset(0 75% 0 0)");
  expect(opening.css?.(1, 0)).toBe("clip-path: inset(0 0% 0 0)");
  expect(opening.css?.(0.5, 0.5)).not.toMatch(/width/);
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

describe("following", () => {
  type Size = { height: number; width: number };
  const sizes = new WeakMap<Element, () => Size>();
  const observers = new Set<{
    told: (entries: unknown[]) => void;
    watching: Set<Element>;
  }>();
  let laidOut = 0;
  let order: string[] = [];

  function report(targets: readonly Element[]): void {
    for (const observer of observers) {
      const entries = targets
        .filter((target) => observer.watching.has(target))
        .map((target) => {
          const size = sizes.get(target)?.() ?? { height: 0, width: 0 };
          return {
            target,
            borderBoxSize: [{ blockSize: size.height, inlineSize: size.width }],
          };
        });
      if (entries.length > 0) observer.told(entries);
    }
  }

  function box(within?: HTMLElement) {
    const node = document.createElement("div");
    const content = document.createElement("div");
    node.append(content);
    within?.append(node);
    let size: Size = { height: 100, width: 400 };
    let standing = 100;
    sizes.set(content, () => size);
    for (const read of ["offsetHeight", "offsetWidth"]) {
      for (const each of [node, content]) {
        Object.defineProperty(each, read, {
          get: () => {
            laidOut += 1;
            return 0;
          },
        });
      }
    }
    node.getBoundingClientRect = () => {
      order.push("read");
      return { height: standing } as DOMRect;
    };
    const animate = vi.fn(() => order.push("grow"));
    let running: { cancel: () => void }[] = [];
    Object.assign(node, { animate, getAnimations: () => running });
    Object.assign(content, { getAnimations: () => [] });
    return {
      node,
      content,
      animate,
      changed(next: Partial<Size>) {
        size = { ...size, ...next };
      },
      resize(next: Partial<Size>) {
        size = { ...size, ...next };
        report([content]);
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
    laidOut = 0;
    root.style.setProperty("--duration-short", "150ms");
    order = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        #observer: {
          told: (entries: unknown[]) => void;
          watching: Set<Element>;
        };
        constructor(told: (entries: unknown[]) => void) {
          this.#observer = { told, watching: new Set() };
          observers.add(this.#observer);
        }
        observe(target: Element) {
          this.#observer.watching.add(target);
          report([target]);
        }
        unobserve(target: Element) {
          this.#observer.watching.delete(target);
        }
        disconnect() {
          this.#observer.watching.clear();
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

  test("takes the sizes the observer reports, and lays nothing out to learn them", () => {
    const { node, resize } = box();
    following(node);

    resize({ height: 240 });
    resize({ height: 180, width: 300 });

    expect(laidOut).toBe(0);
  });

  test("a change landing mid-way turns the box from where it stands", () => {
    const { node, animate, resize, midway } = box();
    following(node);

    resize({ height: 240 });
    midway(170);
    resize({ height: 60 });

    expect(froms(animate).at(-1)).toEqual(["170px", "60px"]);
  });

  test("a box inside that is already growing is followed rather than grown again", () => {
    const { node, content, animate, resize } = box();
    following(node);
    Object.assign(content, {
      getAnimations: () => [{ id: "growing" }],
    });

    resize({ height: 240 });
    expect(animate).not.toHaveBeenCalled();
  });

  test("a box inside that starts growing in the same change is the one that grows", () => {
    const outer = box();
    const inner = box(outer.content);
    following(outer.node);
    following(inner.node);

    outer.changed({ height: 240 });
    inner.changed({ height: 160 });
    report([outer.content, inner.content]);

    expect(outer.animate).not.toHaveBeenCalled();
    expect(froms(inner.animate)).toEqual([["100px", "160px"]]);
  });

  test("boxes that change together are all measured before any of them grows", () => {
    const boxes = [box(), box(), box()];
    for (const each of boxes) following(each.node);
    for (const each of boxes) each.midway(120);

    for (const each of boxes) each.changed({ height: 200 });
    report(boxes.map((each) => each.content));

    expect(order).toEqual(["read", "read", "read", "grow", "grow", "grow"]);
  });

  test("a box let go of is no longer followed", () => {
    const { node, animate, resize } = box();
    following(node)();

    resize({ height: 240 });
    expect(animate).not.toHaveBeenCalled();
  });

  test("a change of width is the window's, and moves nothing", () => {
    const { node, animate, resize } = box();
    following(node);

    resize({ height: 180, width: 300 });
    expect(animate).not.toHaveBeenCalled();
  });
});

/** Going away, it stays where it stood however the thing it hung from moves. */
test("a pinned element is held at the place it stood when it started to go", () => {
  const node = document.createElement("div");
  Object.defineProperty(node, "offsetTop", { value: 24 });
  Object.defineProperty(node, "offsetLeft", { value: 180 });
  node.style.marginTop = "4px";

  pinned(node);

  expect(node.style.top).toBe("24px");
  expect(node.style.left).toBe("180px");
  expect(node.style.margin).toBe("0px");
});

test("a pinned element is held to the fraction of a pixel it stood at", () => {
  const parent = document.createElement("div");
  const node = document.createElement("div");
  parent.append(node);
  Object.defineProperty(node, "offsetParent", { value: parent });
  parent.getBoundingClientRect = () => ({ top: 10, left: 20.25 }) as DOMRect;
  node.getBoundingClientRect = () => ({ top: 34.5, left: 200.75 }) as DOMRect;

  pinned(node);

  expect(node.style.top).toBe("24.5px");
  expect(node.style.left).toBe("180.5px");
});

describe("settled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("waits for what ends, and not for what turns forever", async () => {
    vi.stubGlobal("requestAnimationFrame", (frame: () => void) =>
      setTimeout(frame, 0),
    );
    let finish = () => {};
    const ending = {
      effect: { getComputedTiming: () => ({ endTime: 200 }) },
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    const turning = {
      effect: { getComputedTiming: () => ({ endTime: Infinity }) },
      finished: new Promise<void>(() => {}),
    };
    const node = document.createElement("div");
    node.getAnimations = () => [ending, turning] as unknown as Animation[];

    let done = false;
    const waiting = settled(node).then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(done).toBe(false);

    finish();
    await waiting;
    expect(done).toBe(true);
  });
});

describe("markingHidden", () => {
  test("marks again as an entry grows in, which the list itself never hears of", async () => {
    const watched: Element[] = [];
    let resize = () => {};
    const real = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(heard: () => void) {
        resize = heard;
      }
      observe(node: Element): void {
        watched.push(node);
      }
      unobserve(): void {}
      disconnect(): void {
        watched.length = 0;
      }
    } as unknown as typeof ResizeObserver;

    try {
      const list = document.createElement("div");
      let height = 100;
      Object.defineProperty(list, "scrollTop", { get: () => 0 });
      Object.defineProperty(list, "clientHeight", { get: () => 100 });
      Object.defineProperty(list, "scrollHeight", { get: () => height });
      const stop = markingHidden(list);

      const entry = document.createElement("div");
      list.append(entry);
      await new Promise((settled) => setTimeout(settled, 0));
      expect(watched).toContain(entry);

      height = 300;
      resize();
      expect(list.hasAttribute("data-hidden-below")).toBe(true);
      stop();
    } finally {
      window.ResizeObserver = real;
    }
  });

  test("marks the edges a list lies hidden past, beyond a nudge of the wheel", () => {
    const list = document.createElement("div");
    // jsdom lays nothing out, so a list measures only what it is told.
    let top = 0;
    let height = 100;
    Object.defineProperty(list, "scrollTop", { get: () => top });
    Object.defineProperty(list, "clientHeight", { get: () => 100 });
    Object.defineProperty(list, "scrollHeight", { get: () => height });
    const stop = markingHidden(list);
    const marks = () => [
      list.hasAttribute("data-hidden-above"),
      list.hasAttribute("data-hidden-below"),
    ];

    expect(marks()).toEqual([false, false]);

    height = 300;
    list.dispatchEvent(new Event("scroll"));
    expect(marks()).toEqual([false, true]);

    top = 2;
    list.dispatchEvent(new Event("scroll"));
    expect(marks()).toEqual([false, true]);

    top = 100;
    list.dispatchEvent(new Event("scroll"));
    expect(marks()).toEqual([true, true]);

    top = 198;
    list.dispatchEvent(new Event("scroll"));
    expect(marks()).toEqual([true, false]);
    stop();
  });
});
