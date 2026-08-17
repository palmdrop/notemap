/**
 * Not a position in the domain sense: a scroll offset does not translate to
 * another device or viewport, so it never leaves this shell.
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
