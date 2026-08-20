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
