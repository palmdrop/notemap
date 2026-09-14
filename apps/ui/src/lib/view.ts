/**
 * The two ways a list is read: as a timeline of what was written, or as an
 * index of one line per item, for scanning rather than reading.
 */
export type View = "timeline" | "index";

/** The surfaces that have both. The log is a list of actions, not of items. */
export type Surface = "queue" | "feed";

export const PARAM = "view";

const KEY = "notemap:view";

const VIEWS: readonly View[] = ["timeline", "index"];

function known(said: string | null): View | undefined {
  return VIEWS.includes(said as View) ? (said as View) : undefined;
}

/**
 * The URL first, so a read reloads and travels as the one that was shared; then
 * what this shell was last told; then the timeline, which is what a list is
 * until somebody asks for less of it.
 */
export function viewFor(surface: Surface, url: URL): View {
  return (
    known(url.searchParams.get(PARAM)) ??
    known(localStorage.getItem(`${KEY}:${surface}`)) ??
    "timeline"
  );
}

export function remember(surface: Surface, view: View): void {
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
