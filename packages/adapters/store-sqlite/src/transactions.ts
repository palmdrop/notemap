import type Database from "better-sqlite3";

/**
 * Runs transactions one at a time over a single connection.
 *
 * `BEGIN` is connection state, not a scope, so two transactions overlapping on
 * one connection would issue their statements into each other. Core's callback
 * may await between statements — that is the whole point of an asynchronous
 * transaction — so overlap is reachable whenever two operations are in flight,
 * and the queue is what makes it not happen.
 *
 * The write lock is held for as long as the callback runs. Core doing outside
 * I/O in there stalls every other write against the pool.
 */
export function serializeTransactions(connection: Database.Database): {
  run: <T>(work: () => Promise<T>) => Promise<T>;
} {
  let tail: Promise<unknown> = Promise.resolve();
  let inside = false;

  async function execute<T>(work: () => Promise<T>): Promise<T> {
    inside = true;
    connection.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      connection.exec("COMMIT");
      return result;
    } catch (cause) {
      connection.exec("ROLLBACK");
      throw cause;
    } finally {
      inside = false;
    }
  }

  return {
    run: <T>(work: () => Promise<T>): Promise<T> => {
      // Refused here rather than once the queue reaches it: a nested call would
      // be waiting on the transaction it is nested inside, and neither would
      // ever finish.
      if (inside) {
        return Promise.reject(
          new Error(
            "a transaction was opened inside another and would deadlock",
          ),
        );
      }

      // Chained off the tail rather than awaited, so one failing transaction
      // does not reject the next one in line.
      const queued = tail.then(
        () => execute(work),
        () => execute(work),
      );
      tail = queued.catch(() => undefined);
      return queued;
    },
  };
}
