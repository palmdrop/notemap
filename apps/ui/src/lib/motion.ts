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

function easing(curve: "motion" | "fade" = "motion"): (t: number) => number {
  return bezier(token(`--ease-${curve}`)) ?? ((t) => t);
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

function timing(
  { magnitude = "long", still = false }: Moving = {},
  curve: "motion" | "fade" = "motion",
) {
  return { duration: still ? 0 : duration(magnitude), easing: easing(curve) };
}

/**
 * Height, and the space around it, growing from nothing — or width, across a
 * line; fading too if asked.
 */
export function slide(
  node: Element,
  params: Moving & { fade?: boolean; axis?: "x" | "y" } = {},
): TransitionConfig {
  const moved = sliding(node, { ...timing(params), axis: params.axis ?? "y" });
  if (params.fade !== true) return moved;
  const css = moved.css;
  return {
    ...moved,
    css: (t, u) => `${css?.(t, u) ?? ""};opacity: ${t}`,
  };
}

/**
 * Sliding the way its neighbours run: across in a row of them, and down where
 * a narrow width stacks them.
 */
export function unfold(
  node: Element,
  params: Moving & { fade?: boolean } = {},
): TransitionConfig {
  const parent = node.parentElement;
  const stacked =
    parent !== null &&
    getComputedStyle(parent).flexDirection.startsWith("column");
  return slide(node, {
    magnitude: "short",
    ...params,
    axis: stacked ? "y" : "x",
  });
}

/**
 * Width from nothing at the start of the line, with what is inside drawn to
 * the width it is given: a line opening where a mark stood, whose underline
 * runs out to the right.
 */
export function widen(node: Element, params: Moving = {}): TransitionConfig {
  const width = node.getBoundingClientRect().width;
  return {
    ...timing({ magnitude: "short", ...params }),
    css: (t) => `min-width: 0; max-width: ${String(t * width)}px`,
  };
}

export function fade(node: Element, params: Moving = {}): TransitionConfig {
  return fading(node, timing({ magnitude: "short", ...params }, "fade"));
}

/** Fading in from a little below where it comes to rest. */
export function rise(node: Element, params: Moving = {}): TransitionConfig {
  return fly(node, { ...timing(params), y: RISE });
}

/** Names this module's own height animations, so turning one leaves a slide on the same box be. */
const GROWING = "growing";

/**
 * A box that has just changed height in place, grown from the height it had
 * to the height it now has, where there is no block coming or going to slide:
 * a `more` opened, and whatever `following` sees change. One already growing is
 * turned toward the new height from wherever it stands.
 */
export function grow(node: HTMLElement, from: number): void {
  const time = duration("short");
  if (time === 0 || typeof node.animate !== "function") return;
  for (const moving of node.getAnimations()) {
    if (moving.id === GROWING) moving.cancel();
  }
  const to = node.offsetHeight;
  if (to === from) return;
  node.animate(
    [
      { height: `${String(from)}px`, overflow: "hidden" },
      { height: `${String(to)}px`, overflow: "hidden" },
    ],
    {
      id: GROWING,
      duration: time,
      easing: token("--ease-motion") || "linear",
    },
  );
}

/**
 * Marks a picture `data-loaded` once it has arrived, so it can fade in over
 * the room already kept for it. One the browser already held is marked before
 * it is ever painted, and so is simply there.
 */
export function revealed(node: HTMLImageElement): () => void {
  const show = () => {
    node.dataset["loaded"] = "";
  };
  if (node.complete && node.naturalWidth > 0) show();
  else node.addEventListener("load", show, { once: true });
  return () => node.removeEventListener("load", show);
}

/**
 * A box whose height follows its one child — a row as a tag wraps, a record is
 * read or a picture arrives, a form as a choice brings fields — growing or
 * shrinking into each change rather than jumping, and turned from wherever the
 * box stands when a change lands mid-way. The child is what is measured and the
 * box what moves, so a change mid-way is never mistaken for the box's own
 * motion. A change of width is the window's, and moves nothing.
 */
export function following(node: HTMLElement): () => void {
  const content = node.firstElementChild;
  if (!(content instanceof HTMLElement)) return () => undefined;

  let height: number | undefined;
  let width: number | undefined;

  const watching = new ResizeObserver(() => {
    const was = height;
    const across = width;
    height = content.offsetHeight;
    width = content.offsetWidth;
    if (was === undefined || across !== width || was === height) return;
    const moving =
      typeof node.getAnimations === "function" &&
      node.getAnimations().length > 0;
    grow(node, moving ? node.getBoundingClientRect().height : was);
  });

  watching.observe(content);
  return () => watching.disconnect();
}
