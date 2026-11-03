import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** A route in flight: one a trigger tag or a person made, that has not resolved yet. */
export type Firing = {
  readonly record: string;
  readonly item: string;
  /** What the person pressed: the template's name, or the destination's for a route by hand. */
  readonly name: string;
  /** Where the values given for what it asks put the item, label then value. */
  readonly where?: string;
  /** When the window closes, in epoch milliseconds, where the shell was told. */
  readonly until?: number;
  /** Where the whole of it can be read. */
  readonly href?: string;
  /** The batch it was fired by, called off with the rest of it. */
  readonly batch?: string;
  /** The pool could not reach the destination and will try again, so it can be called off between attempts. */
  readonly retrying?: boolean;
};

/** Enough closed records to stop a late opening, and no memory of the session. */
const REMEMBERED = 200;

/**
 * How long after a window closes the pool is asked how the delivery went, each
 * once. The delivery is attempted as the window closes and most land within a
 * second; the watcher's own tempo is ten, and would leave the corner saying
 * `routing` long after the note was filed.
 */
export const LOOKS_AFTER = [500, 2_000, 5_000] as const;

let open = $state<Firing[]>([]);
let now = $state(Date.now());
let ticking: ReturnType<typeof setInterval> | undefined;

const closed = new SvelteSet<string>();
/** By record, the looks still to come. */
const looks = new SvelteMap<string, ReturnType<typeof setTimeout>[]>();
let asking: (() => void) | undefined;

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
 * Against the same clock the countdown reads. Only what is still ahead: a
 * firing first heard of from the log was heard of by a read.
 */
function lookAfter(firing: Firing): void {
  if (firing.until === undefined || looks.has(firing.record)) return;
  const until = firing.until;
  looks.set(
    firing.record,
    LOOKS_AFTER.map((after) => until + after - Date.now())
      .filter((wait) => wait > 0)
      .map((wait) => setTimeout(() => asking?.(), wait)),
  );
}

function stopLooking(record: string): void {
  for (const look of looks.get(record) ?? []) clearTimeout(look);
  looks.delete(record);
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
 * What a route in flight offers now. Inside its window, `undo`. Once the window
 * has closed the delivery is being attempted, and a cancel would be refused, so
 * nothing until the pool says it will try again; then `cancel`. A window the
 * shell was never told of may still be open, so it is offered `cancel`.
 */
export function offerOf(
  firing: Firing,
  at: number,
): "undo" | "cancel" | undefined {
  if (firing.until === undefined) return "cancel";
  if (left(firing, at) !== undefined) return "undo";
  return firing.retrying === true ? "cancel" : undefined;
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
            ...(known.retrying === true ? { retrying: true } : {}),
          };

    open = [...open.filter((one) => one.record !== firing.record), merged];
    lookAfter(merged);
    tick();
  },

  /** The pool will try this one again: a delivery that failed and has not ended. */
  retrying(record: string): void {
    open = open.map((one) =>
      one.record === record ? { ...one, retrying: true } : one,
    );
  },

  closed(record: string): void {
    closed.add(record);
    if (closed.size > REMEMBERED) {
      const oldest = closed.values().next();
      if (!oldest.done) closed.delete(oldest.value);
    }
    open = open.filter((one) => one.record !== record);
    stopLooking(record);
    tick();
  },

  /** What asks the pool how a firing ended, once its window has closed. */
  asks(ask: (() => void) | undefined): void {
    asking = ask;
  },

  /** A shut door leaves nothing in flight on screen. */
  clear(): void {
    for (const record of looks.keys()) stopLooking(record);
    open = [];
    closed.clear();
    tick();
  },
};
