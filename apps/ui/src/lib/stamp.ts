/**
 * How the register writes a time: fixed width, so a column of them is countable.
 * Local, because the reader's day is what a dated entry is about.
 */
const pad = (value: number) => String(value).padStart(2, "0");

export function dayOf(at: string): string {
  const when = new Date(at);
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

export function timeOf(at: string): string {
  const when = new Date(at);
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/** Inside a line of prose, where the year is already implied by the row. */
export function briefly(at: string): string {
  const when = new Date(at);
  return `${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${timeOf(at)}`;
}

/**
 * How long ago, for a mark that is re-read while it is on screen. Coarse on
 * purpose past a minute: a reader wants to know whether it was just now, not
 * how many seconds it has been.
 */
export function since(at: string, now: number = Date.now()): string {
  const seconds = Math.max(
    0,
    Math.round((now - new Date(at).getTime()) / 1000),
  );

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return briefly(at);
}
