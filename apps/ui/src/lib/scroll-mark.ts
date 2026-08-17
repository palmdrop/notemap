/**
 * Where the person had scrolled, kept for this shell alone. It is not a
 * position in the domain sense: it never reaches the pool and does not
 * translate to another device or another viewport, so nothing carries it.
 */
const KEY = "notemap:scroll";

export function readMark(surface: string): number {
  const held = sessionStorage.getItem(`${KEY}:${surface}`);
  const at = Number(held);
  return Number.isFinite(at) ? at : 0;
}

export function writeMark(surface: string, at: number): void {
  sessionStorage.setItem(`${KEY}:${surface}`, String(Math.round(at)));
}
