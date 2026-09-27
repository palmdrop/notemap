/**
 * The chain, not the top of it: what `fetch` could not do is under two
 * wrappers, and the top of the chain alone says "could not reach the pool"
 * without saying why. For a line that carries a failure as a fact rather than
 * as a stack — a `warn` about one item, where a stack per item is a page of
 * them. A stack belongs to `err`, which pino serializes with its causes.
 */
export function reasonOf(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);

  return cause.cause === undefined
    ? cause.message
    : `${cause.message}: ${reasonOf(cause.cause)}`;
}
