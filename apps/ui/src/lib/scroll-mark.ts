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

/** Puts the view back where this surface was left, once its rows are drawn. */
export function restorePlace(surface: string): void {
  window.scrollTo({ top: readMark(surface) });
}

/**
 * Remembers where the reader is for as long as the surface is drawn. A surface
 * that is not drawn writes nothing, which is what leaves a place to come back
 * to while a person is reading one item.
 */
export function keepPlace(surface: string): () => void {
  const remember = () => writeMark(surface, window.scrollY);
  window.addEventListener("scroll", remember, { passive: true });
  return () => window.removeEventListener("scroll", remember);
}
