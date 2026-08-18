const TIMEOUT = 10_000;
const EVERY = 20;

/**
 * Waits for something to appear. Never for something to be absent: the daemon
 * does its work on its own timers, so "not yet" is a race a test loses on a
 * slow machine rather than an assertion it can make.
 */
export async function until<T>(
  what: string,
  look: () => Promise<T | undefined>,
  timeout = TIMEOUT,
): Promise<T> {
  const deadline = Date.now() + timeout;

  for (;;) {
    const found = await look();
    if (found !== undefined) return found;

    if (Date.now() > deadline) {
      throw new Error(`waited ${timeout}ms for ${what}, which never happened`);
    }
    await new Promise((resolve) => setTimeout(resolve, EVERY));
  }
}
