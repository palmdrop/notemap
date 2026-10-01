import { SvelteSet } from "svelte/reactivity";

/** A route a trigger tag made that has not resolved yet. */
export type Firing = {
  readonly record: string;
  readonly item: string;
  /** The template's name: what the person pressed. */
  readonly name: string;
  /** When the window closes, in epoch milliseconds, where the shell was told. */
  readonly until?: number;
  /** Where the whole of it can be read. */
  readonly href?: string;
};

/** Enough closed records to stop a late opening, and no memory of the session. */
const REMEMBERED = 200;

let open = $state<Firing[]>([]);
let now = $state(Date.now());
let ticking: ReturnType<typeof setInterval> | undefined;

const closed = new SvelteSet<string>();

function tick(): void {
  if (open.length === 0) {
    clearInterval(ticking);
    ticking = undefined;
    return;
  }
  now = Date.now();
  if (ticking === undefined) ticking = setInterval(tick, 1_000);
}

/**
 * Whole seconds left in the window, rounded up so it never reads 0 while it is
 * still open. Absent where the shell was not told, and once the window closes:
 * the delivery is then being attempted and there is nothing to count down.
 */
export function left(firing: Firing, at: number): number | undefined {
  if (firing.until === undefined) return undefined;
  const remaining = Math.ceil((firing.until - at) / 1_000);
  return remaining > 0 ? remaining : undefined;
}

/**
 * Work in flight rather than something that happened, so it is not a notice:
 * it opens when the tag files the item and closes when the pool says how that
 * ended — landed, failed, given up on, or called off. What it ended as is then
 * a notice.
 */
export const firings = {
  /** Oldest first. */
  get open(): readonly Firing[] {
    return open;
  },

  /** The clock the countdowns are read against, ticking while any is open. */
  get now(): number {
    return now;
  },

  /**
   * Opened twice — by the shell as it tags, and by the log a poll later — it is
   * one firing, keeping whatever either knew. A record that already closed
   * stays closed: the log can say it landed before the tag's own look returns.
   */
  opened(firing: Firing): void {
    if (closed.has(firing.record)) return;

    const known = open.find((one) => one.record === firing.record);
    const merged: Firing =
      known === undefined
        ? firing
        : {
            ...known,
            ...firing,
            ...(firing.until === undefined && known.until !== undefined
              ? { until: known.until }
              : {}),
          };

    open = [...open.filter((one) => one.record !== firing.record), merged];
    tick();
  },

  closed(record: string): void {
    closed.add(record);
    if (closed.size > REMEMBERED) {
      const oldest = closed.values().next();
      if (!oldest.done) closed.delete(oldest.value);
    }
    open = open.filter((one) => one.record !== record);
    tick();
  },

  /** A shut door leaves nothing in flight on screen. */
  clear(): void {
    open = [];
    closed.clear();
    tick();
  },
};
