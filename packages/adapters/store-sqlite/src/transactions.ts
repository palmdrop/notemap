import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync } from "node:sqlite";

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
 * I/O in there stalls every other write against the pool; that is a convention
 * core keeps, not something this can enforce.
 */
export function serializeTransactions(connection: DatabaseSync): {
  run: <T>(work: () => Promise<T>) => Promise<T>;
} {
  let tail: Promise<unknown> = Promise.resolve();

  /**
   * Set for the duration of one transaction's callback and inherited by
   * everything it awaits. A plain boolean cannot tell a nested call from an
   * unrelated one that merely arrived while a transaction was in flight, and
   * would reject the second — which is every concurrent caller, since every
   * `await` in the callback is a window for one to arrive.
   */
  const active = new AsyncLocalStorage<true>();

  async function execute<T>(work: () => Promise<T>): Promise<T> {
    // Inside the guard: a BEGIN that fails — SQLITE_BUSY against a second host
    // process — must not leave the queue believing a transaction is open.
    connection.exec("BEGIN IMMEDIATE");

    try {
      const result = await active.run(true, work);
      connection.exec("COMMIT");
      return result;
    } catch (cause) {
      rollback();
      throw cause;
    }
  }

  function rollback(): void {
    try {
      connection.exec("ROLLBACK");
    } catch {
      // SQLite rolls back by itself on some errors — a full disk, an I/O
      // error — and then ROLLBACK throws. Swallowed so the failure core
      // actually needs to see is the one that propagates.
    }
  }

  return {
    run: <T>(work: () => Promise<T>): Promise<T> => {
      if (active.getStore()) {
        return Promise.reject(
          new Error(
            "a transaction was opened inside another and would wait on itself",
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
