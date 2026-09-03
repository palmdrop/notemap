import type { Order } from "@notemap/client";

/**
 * Every surface a reader starts from one end of. An item is not one: it is one
 * entity rather than a register, so it has no end and remembers no order. A
 * surface added here is claiming to have both.
 */
export type Surface = "queue" | "feed" | "log";

export const PARAM = "order";

const KEY = "notemap:order";

const ORDERS: readonly Order[] = ["oldest-first", "newest-first"];

/**
 * The end each surface starts from before anyone has said otherwise. The queue
 * is a queue because it starts at the oldest; the feed and the log are read
 * newest first, being an account of what has happened.
 */
const DEFAULTS: Record<Surface, Order> = {
  queue: "oldest-first",
  feed: "newest-first",
  log: "newest-first",
};

function known(said: string | null): Order | undefined {
  return ORDERS.includes(said as Order) ? (said as Order) : undefined;
}

/**
 * The URL first, so a read reloads and travels as the one that was shared; then
 * what this shell was last told, which is what a fresh visit falls back to. A
 * parameter naming an order that does not exist falls through the same chain
 * rather than failing.
 */
export function orderFor(surface: Surface, url: URL): Order {
  return (
    known(url.searchParams.get(PARAM)) ??
    known(localStorage.getItem(`${KEY}:${surface}`)) ??
    DEFAULTS[surface]
  );
}

export function remember(surface: Surface, order: Order): void {
  localStorage.setItem(`${KEY}:${surface}`, order);
}

/** The same URL with the order named on it. Turning a surface replaces rather
 * than pushes: which end you read from is not a place to go back to. */
export function withOrder(url: URL, order: Order): URL {
  const next = new URL(url);
  next.searchParams.set(PARAM, order);
  return next;
}
