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

/** How far a line that says something new travels as it arrives. */
const ARRIVE = 24;

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

/**
 * Taken before Svelte's own transitions are asked, which read the node's style
 * even for no time at all: a page of rows arriving from a read is drawn still,
 * and each read would lay the page out again behind the row before it.
 */
const STILL = { duration: 0, easing: (t: number) => t } as const;

function timing(
  { magnitude = "long", still = false }: Moving = {},
  curve: "motion" | "fade" = "motion",
) {
  if (still) return STILL;
  return { duration: duration(magnitude), easing: easing(curve) };
}

/**
 * Height, and the space around it, growing from nothing — or width, across a
 * line; fading too if asked.
 */
export function slide(
  node: Element,
  params: Moving & { fade?: boolean; axis?: "x" | "y" } = {},
): TransitionConfig {
  if (params.still === true) return STILL;
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
  if (params.still === true) return STILL;
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
 * Drawn out from the start of the line across the room it already holds: the
 * box is its full size from the first frame, so nothing beside or below it
 * moves while it opens.
 */
export function drawOut(node: Element, params: Moving = {}): TransitionConfig {
  return {
    ...timing({ magnitude: "short", ...params }),
    css: (t) => `clip-path: inset(0 ${String((1 - t) * 100)}% 0 0)`,
  };
}

export function fade(node: Element, params: Moving = {}): TransitionConfig {
  if (params.still === true) return STILL;
  return fading(node, timing({ magnitude: "short", ...params }, "fade"));
}

/**
 * Sliding shut from exactly where it stood. Something placed against
 * another element follows it while it moves; going away, it stays put, so a
 * line that moves as it closes does not drag the closing thing along.
 */
export function pinned(
  node: HTMLElement,
  params: Moving = {},
): TransitionConfig {
  // Read off the boxes rather than `offsetTop`, which rounds to a whole pixel
  // and would step the closing thing sideways as it starts to go.
  const parent = node.offsetParent;
  const at = node.getBoundingClientRect();
  const base = parent?.getBoundingClientRect();
  const top =
    parent === null || base === undefined
      ? node.offsetTop
      : at.top - base.top - parent.clientTop + parent.scrollTop;
  const left =
    parent === null || base === undefined
      ? node.offsetLeft
      : at.left - base.left - parent.clientLeft + parent.scrollLeft;
  node.style.setProperty("position-try-fallbacks", "none");
  node.style.margin = "0";
  node.style.top = `${String(top)}px`;
  node.style.left = `${String(left)}px`;
  node.style.right = "auto";
  return slide(node, params);
}

/** Arriving from the side it is read from: a line that has something new to say. */
export function arrive(node: Element, params: Moving = {}): TransitionConfig {
  if (params.still === true) return STILL;
  return fly(node, { ...timing(params), x: -ARRIVE });
}

/** Scrolled to the nearest edge that shows it whole, gliding there unless motion is off. */
export function bringIntoView(
  node: Element,
  { headFirst = false }: { headFirst?: boolean } = {},
): void {
  node.scrollIntoView({
    block: headFirst && !fits(node) ? "start" : "nearest",
    behavior: duration("short") === 0 ? "instant" : "smooth",
  });
}

/** Whether the box fits the view less what stands over its edges. */
function fits(node: Element): boolean {
  const clear = (value: string) => Number.parseFloat(value) || 0;
  const covered =
    clear(getComputedStyle(node).scrollMarginTop) +
    clear(getComputedStyle(document.documentElement).scrollPaddingBottom);
  return node.getBoundingClientRect().height <= window.innerHeight - covered;
}

function nextFrame(): Promise<unknown> {
  return new Promise((frame) => requestAnimationFrame(frame));
}

/**
 * Resolves once nothing in or on `node` that ever ends is still moving. Two
 * frames first: a box that follows its content's height starts growing from a
 * resize observer, which hears of the change only after the first frame's
 * callbacks have run.
 */
export async function settled(node: Element): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return;
  await nextFrame();
  await nextFrame();
  if (typeof node.getAnimations !== "function") return;
  await Promise.all(
    node
      .getAnimations({ subtree: true })
      .filter(
        (moving) => moving.effect?.getComputedTiming().endTime !== Infinity,
      )
      .map((moving) => moving.finished.catch(() => undefined)),
  );
}

/** Fading in from a little below where it comes to rest. */
export function rise(node: Element, params: Moving = {}): TransitionConfig {
  if (params.still === true) return STILL;
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
export function grow(node: HTMLElement, from: number, to?: number): void {
  const time = duration("short");
  if (time === 0 || typeof node.animate !== "function") return;
  for (const moving of node.getAnimations()) {
    if (moving.id === GROWING) moving.cancel();
  }
  to ??= node.offsetHeight;
  if (to === from) return;
  // Clipped on the one axis that moves: `hidden` would clip across too, and a
  // selected row's box reaches outside its columns.
  node.animate(
    [
      { height: `${String(from)}px`, overflowY: "clip" },
      { height: `${String(to)}px`, overflowY: "clip" },
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
 * the room already kept for it, and `data-failed` if it never will. One the
 * browser already held is marked before it is ever painted, and so is simply
 * there.
 */
export function revealed(node: HTMLImageElement): () => void {
  const show = () => {
    node.dataset["loaded"] = "";
  };
  const fail = () => {
    node.dataset["failed"] = "";
  };
  if (node.complete && node.naturalWidth > 0) show();
  else node.addEventListener("load", show, { once: true });
  node.addEventListener("error", fail, { once: true });
  return () => {
    node.removeEventListener("load", show);
    node.removeEventListener("error", fail);
  };
}

/**
 * A box whose height follows its one child — a row as a tag wraps, a record is
 * read or a picture arrives, a form as a choice brings fields — growing or
 * shrinking into each change rather than jumping, and turned from wherever the
 * box stands when a change lands mid-way. The child is what is measured and the
 * box what moves, so a change mid-way is never mistaken for the box's own
 * motion. A change of width is the window's, and moves nothing.
 *
 * The child must not stretch to the box — `self-start` in a grid or a flex
 * box — or every frame of the box's growth reads as a change of its own.
 */
export function following(node: HTMLElement): () => void {
  const content = node.firstElementChild;
  if (!(content instanceof HTMLElement)) return () => undefined;

  followed.set(content, { node, content });
  watching ??= new ResizeObserver(heard);
  watching.observe(content);
  return () => {
    watching?.unobserve(content);
    followed.delete(content);
  };
}

type Follower = {
  readonly node: HTMLElement;
  readonly content: HTMLElement;
  height?: number;
  width?: number;
};

type Growth = {
  readonly node: HTMLElement;
  readonly content: HTMLElement;
  readonly from: number;
  readonly to: number;
};

const followed = new WeakMap<Element, Follower>();

// One observer for every box, its sizes the observer's own, every one read
// before any box starts to grow: each growth started dirties the layout the
// next row's read would otherwise have to lay out again.
let watching: ResizeObserver | undefined;

function heard(entries: readonly ResizeObserverEntry[]): void {
  const growths: Growth[] = [];
  for (const { target, borderBoxSize } of entries) {
    const follower = followed.get(target);
    const size = borderBoxSize[0];
    if (follower === undefined || size === undefined) continue;
    const { node, content } = follower;
    const was = follower.height;
    const across = follower.width;
    follower.height = Math.round(size.blockSize);
    follower.width = Math.round(size.inlineSize);
    if (was === undefined || across !== follower.width) continue;
    if (was === follower.height) continue;
    // A box inside already grows toward the same height, and the content's
    // every frame of it would otherwise restart this one a frame behind.
    if (growingWithin(content)) continue;
    const moving =
      typeof node.getAnimations === "function" &&
      node.getAnimations().length > 0;
    const from = moving ? node.getBoundingClientRect().height : was;
    growths.push({ node, content, from, to: follower.height });
  }

  for (const growth of growths) {
    const inner = growths.some(
      (other) => other !== growth && growth.content.contains(other.node),
    );
    if (!inner) grow(growth.node, growth.from, growth.to);
  }
}

function growingWithin(content: HTMLElement): boolean {
  return (
    typeof content.getAnimations === "function" &&
    content
      .getAnimations({ subtree: true })
      .some((animation) => animation.id === GROWING)
  );
}

/** Longer than any entry takes to grow in once it has arrived. */
const ARRIVING = 1000;

/**
 * A list held to a height, kept at its end while anything arriving in it
 * grows in: a file added past what the list shows would otherwise arrive out
 * of sight, and the end is not where it will be until the arrival has grown.
 */
export function showingNewest(node: HTMLElement): () => void {
  let pinned = false;
  let release: ReturnType<typeof setTimeout> | undefined;

  function toEnd(): void {
    if (pinned) node.scrollTop = node.scrollHeight;
  }

  const resized = new ResizeObserver(toEnd);
  const changed = new MutationObserver((changes) => {
    for (const entry of node.children) resized.observe(entry);
    if (!changes.some((change) => change.addedNodes.length > 0)) return;
    pinned = true;
    toEnd();
    clearTimeout(release);
    release = setTimeout(() => {
      pinned = false;
    }, ARRIVING);
  });

  for (const entry of node.children) resized.observe(entry);
  changed.observe(node, { childList: true });
  return () => {
    clearTimeout(release);
    resized.disconnect();
    changed.disconnect();
  };
}

/** How much of a list may lie past an edge before it counts as hidden there: a nudge of the wheel. */
const HIDDEN = 4;

/**
 * Marks a list `data-hidden-above` and `data-hidden-below` while some of it
 * lies scrolled past that edge, for a rule to appear by.
 */
export function markingHidden(node: HTMLElement): () => void {
  function mark(): void {
    const below = node.scrollHeight - node.clientHeight - node.scrollTop;
    node.toggleAttribute("data-hidden-above", node.scrollTop > HIDDEN);
    node.toggleAttribute("data-hidden-below", below > HIDDEN);
  }

  // Each entry as well as the list: an entry grows in after it arrives, and
  // the list stops growing with it once it is held to its height.
  const resized = new ResizeObserver(mark);
  function observeAll(): void {
    resized.disconnect();
    resized.observe(node);
    for (const entry of node.children) resized.observe(entry);
  }

  const changed = new MutationObserver(() => {
    observeAll();
    mark();
  });
  node.addEventListener("scroll", mark, { passive: true });
  observeAll();
  changed.observe(node, { childList: true });
  mark();

  return () => {
    node.removeEventListener("scroll", mark);
    resized.disconnect();
    changed.disconnect();
  };
}

/** A sheet rising from the foot, its whole height. */
export function fromFoot(node: Element, params: Moving = {}): TransitionConfig {
  return fly(node, { ...timing(params), y: "100%", opacity: 1 });
}

/** A panel or the drawer coming in from its side, its whole width. */
export function fromSide(
  node: Element,
  params: Moving & { side?: "left" | "right" } = {},
): TransitionConfig {
  const x = params.side === "left" ? "-100%" : "100%";
  return fly(node, { ...timing(params), x, opacity: 1 });
}

/**
 * A row going out sideways, and the rows below closing up behind it: half the
 * time travelling, half closing, so the gap never opens before the row is gone.
 */
export function leave(node: Element, params: Moving = {}): TransitionConfig {
  if (params.still === true) return STILL;
  const { duration: time, easing: curve } = timing(params);
  const height = node.getBoundingClientRect().height;
  return {
    duration: time * 2,
    easing: curve,
    css: (t) => {
      const across = Math.min(1, (1 - t) * 2);
      const closing = Math.max(0, (1 - t) * 2 - 1);
      return `transform: translateX(${String(-across * 100)}%); opacity: ${String(1 - across)}; height: ${String(height * (1 - closing))}px; overflow: hidden`;
    },
  };
}
