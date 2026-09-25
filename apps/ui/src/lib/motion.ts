import {
  fade as fading,
  fly,
  slide as sliding,
  type TransitionConfig,
} from "svelte/transition";

export type Magnitude = "short" | "long";

export type Moving = {
  magnitude?: Magnitude;
  /** Drawn at once, as though nothing moved: the change is one a read brought. */
  still?: boolean;
};

/** How far a rising thing travels, in pixels: a third of the shell's line. */
const RISE = 8;

function token(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Milliseconds, read off the tokens as the transition starts. A stylesheet
 * that is not there, and a reader who asked for reduced motion, both come
 * out as zero, and Svelte runs no animation at all for zero.
 */
export function duration(magnitude: Magnitude): number {
  const said = token(`--duration-${magnitude}`);
  const found = /^(\d*\.?\d+)(ms|s)$/.exec(said);
  if (found === null) return 0;
  const value = Number(found[1]);
  return found[2] === "s" ? value * 1000 : value;
}

export function easing(): (t: number) => number {
  return bezier(token("--ease-motion")) ?? ((t) => t);
}

/** `cubic-bezier(x1, y1, x2, y2)` as the function of time CSS would make of it. */
export function bezier(said: string): ((t: number) => number) | undefined {
  const found = /^cubic-bezier\(([^)]*)\)$/.exec(said);
  if (found === null) return undefined;
  const points = found[1]!.split(",").map(Number);
  if (points.length !== 4 || points.some(Number.isNaN)) return undefined;
  const [x1, y1, x2, y2] = points as [number, number, number, number];

  const along = (t: number, a: number, b: number): number =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step += 1) {
      const t = (low + high) / 2;
      if (along(t, x1, x2) < x) low = t;
      else high = t;
    }
    return along((low + high) / 2, y1, y2);
  };
}

function timing({ magnitude = "long", still = false }: Moving = {}) {
  return { duration: still ? 0 : duration(magnitude), easing: easing() };
}

/** Height, and the space around it, growing from nothing; fading too if asked. */
export function slide(
  node: Element,
  params: Moving & { fade?: boolean } = {},
): TransitionConfig {
  const moved = sliding(node, timing(params));
  if (params.fade !== true) return moved;
  const css = moved.css;
  return {
    ...moved,
    css: (t, u) => `${css?.(t, u) ?? ""};opacity: ${t}`,
  };
}

export function fade(node: Element, params: Moving = {}): TransitionConfig {
  return fading(node, timing({ magnitude: "short", ...params }));
}

/** Fading in from a little below where it comes to rest. */
export function rise(node: Element, params: Moving = {}): TransitionConfig {
  return fly(node, { ...timing(params), y: RISE });
}

/**
 * A box that has just changed height in place, grown from the height it had:
 * what a `more` opens, where there is no block coming or going to slide.
 */
export function grow(node: HTMLElement, from: number): void {
  const time = duration("short");
  const to = node.offsetHeight;
  if (time === 0 || to === from || typeof node.animate !== "function") return;
  node.animate(
    [
      { height: `${String(from)}px`, overflow: "hidden" },
      { height: `${String(to)}px`, overflow: "hidden" },
    ],
    { duration: time, easing: token("--ease-motion") || "linear" },
  );
}
