import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync } from "node:sqlite";

/** Long enough that no honest transaction reaches it, short of a pool wedged forever. */
export const DEFAULT_TRANSACTION_TIMEOUT_MS = 30_000;

export type Transactions = {
  run: <T>(work: (fence: Fence) => Promise<T>) => Promise<T>;
};

/**
 * Held by everything a transaction hands to core, and checked before each
 * statement. Once a transaction has ended, its handle is dead: a statement
 * issued afterwards would land outside any transaction — auto-committing on its
 * own, unreviewable, unrollbackable — or worse, inside whichever transaction
 * happened to start next.
 *
 * That is reachable without core doing anything exotic: leak `tx` into a promise
 * the callback forgets to await, and its writes arrive after the commit.
 */
export type Fence = {
  check(): void;
};

export function serializeTransactions(
  connection: DatabaseSync,
  timeoutMs: number = DEFAULT_TRANSACTION_TIMEOUT_MS,
): Transactions {
  let tail: Promise<unknown> = Promise.resolve();

  /**
   * Set for the duration of one transaction's callback and inherited by
   * everything it awaits. A plain boolean cannot tell a nested call from an
   * unrelated one that merely arrived while a transaction was in flight, and
   * would reject the second — which is every concurrent caller, since every
   * `await` in the callback is a window for one to arrive.
   *
   * The stored state is the same liveness the fence checks, so a call that
   * inherited the context of a transaction already over — async work leaked
   * out of a callback — is told that, rather than accused of nesting.
   */
  const active = new AsyncLocalStorage<{ live: boolean }>();

  async function execute<T>(work: (fence: Fence) => Promise<T>): Promise<T> {
    // Inside the guard: a BEGIN that fails — SQLITE_BUSY against a second host
    // process — must not leave the queue believing a transaction is open.
    connection.exec("BEGIN IMMEDIATE");

    const state = { live: true };
    const fence: Fence = {
      check: () => {
        if (!state.live) {
          throw new Error(
            "this transaction has ended; its handle cannot be used any more",
          );
        }
      },
    };

    let expire: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      expire = setTimeout(() => {
        reject(
          new Error(
            `transaction exceeded ${timeoutMs}ms and was rolled back; core must not wait on the outside world inside one`,
          ),
        );
      }, timeoutMs);
      // The pool should not be held open purely by this timer.
      expire.unref?.();
    });

    try {
      // Racing is only safe because of the fence: the callback keeps running
      // after a timeout, and the fence is what stops its later statements
      // reaching the connection.
      const result = await Promise.race([
        active.run(state, () => work(fence)),
        timeout,
      ]);
      connection.exec("COMMIT");
      return result;
    } catch (cause) {
      rollback();
      throw cause;
    } finally {
      state.live = false;
      clearTimeout(expire);
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
    run: <T>(work: (fence: Fence) => Promise<T>): Promise<T> => {
      const enclosing = active.getStore();
      if (enclosing) {
        return Promise.reject(
          new Error(
            enclosing.live
              ? "a transaction was opened inside another and would wait on itself"
              : "this call inherited a transaction that has already ended; it leaked out of its callback",
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
