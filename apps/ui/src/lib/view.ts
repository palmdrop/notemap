/**
 * The ways a list is read: as a timeline of what was written, as an index of
 * one line per item, for scanning rather than reading, or as the tags its
 * items carry, which is the way to a filter rather than a reading of items.
 */
export type View = "timeline" | "index" | "tags";

/** The surfaces that have both. The log is a list of actions, not of items. */
export type Surface = "queue" | "feed";

export const PARAM = "view";

const KEY = "notemap:view";

const VIEWS: readonly View[] = ["timeline", "index", "tags"];

/** The views a surface opens on, and so the only ones remembered: a surface always opens on items. */
const REMEMBERED: readonly View[] = ["timeline", "index"];

function known(
  said: string | null,
  among: readonly View[] = VIEWS,
): View | undefined {
  return among.includes(said as View) ? (said as View) : undefined;
}

/**
 * The URL first, so a read reloads and travels as the one that was shared; then
 * what this shell was last told; then the timeline, which is what a list is
 * until somebody asks for less of it.
 */
export function viewFor(surface: Surface, url: URL): View {
  return known(url.searchParams.get(PARAM)) ?? remembered(surface);
}

/** The view of items this surface was last read in, whatever the address says. */
export function remembered(surface: Surface): View {
  return (
    known(localStorage.getItem(`${KEY}:${surface}`), REMEMBERED) ?? "timeline"
  );
}

export function remember(surface: Surface, view: View): void {
  if (REMEMBERED.includes(view))
    localStorage.setItem(`${KEY}:${surface}`, view);
}

/**
 * The same URL with the view named on it, or with nothing where it is the
 * timeline: the plain address is the plain view. Replaces rather than pushes,
 * like the order — how a list is read is not a place to go back to.
 */
export function withView(url: URL, view: View): URL {
  const next = new URL(url);
  if (view === "timeline") next.searchParams.delete(PARAM);
  else next.searchParams.set(PARAM, view);
  return next;
}
