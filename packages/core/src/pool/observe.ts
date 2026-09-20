import type { PoolPorts, PoolStore, PoolTx } from "#types/api/ports";
import type { Action } from "#types/domain/action-log";

/**
 * Ports whose store tells the observer what each transaction appended, once
 * it has committed. Nothing else about the ports changes, and ports without an
 * observer come back as they were.
 */
export function observed(ports: PoolPorts): PoolPorts {
  const { observer } = ports;
  if (observer === undefined) return ports;

  const { store } = ports;

  const transaction = async <T>(
    work: (tx: PoolTx) => Promise<T>,
  ): Promise<T> => {
    const appended: Action[] = [];

    const result = await store.transaction((tx) =>
      work({
        ...tx,
        appendAction: async (action) => {
          await tx.appendAction(action);
          appended.push(action);
        },
      }),
    );

    for (const action of appended) {
      try {
        observer.action(action);
      } catch (cause) {
        // The write has committed, so its caller is not who this failed for.
        queueMicrotask(() => {
          throw cause;
        });
      }
    }

    return result;
  };

  const observing: PoolStore = { ...store, transaction };

  return { ...ports, store: observing };
}
