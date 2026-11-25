import { preloadCode } from "$app/navigation";

/** Every surface, by any address that reaches it. */
const SURFACES = [
  "/",
  "/feed",
  "/capture",
  "/log",
  "/settings",
  "/settings/*",
  "/items/*",
  "/items/*/process",
  "/items/*/records/*",
];

/**
 * Fetches every surface's code once the first is drawn and the page is idle,
 * so moving to one later waits on nothing but drawing it.
 */
export function preloadSurfaces(): void {
  const idle =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (run: () => void) => setTimeout(run, 1);
  idle(() => {
    for (const surface of SURFACES) {
      try {
        void preloadCode(surface).catch(() => undefined);
      } catch {
        // Outside a running router there is nothing to fetch into.
      }
    }
  });
}
