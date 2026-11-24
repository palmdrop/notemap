import { on } from "svelte/events";

/**
 * Keeps `--visible-top` and `--visible-height` on the root as the part of the
 * page the person can see: on a phone, what the keyboard leaves of it. A
 * sheet held to them sits on the keyboard rather than behind it, and stays
 * put while the browser pans the page under it.
 */
export function watchVisible(): () => void {
  const seen = window.visualViewport;
  if (seen === null || seen === undefined) return () => undefined;
  const root = document.documentElement.style;
  const measure = (): void => {
    root.setProperty("--visible-top", `${String(seen.offsetTop)}px`);
    root.setProperty("--visible-height", `${String(seen.height)}px`);
  };
  measure();
  const resized = on(seen, "resize", measure);
  const scrolled = on(seen, "scroll", measure);
  return () => {
    resized();
    scrolled();
  };
}
