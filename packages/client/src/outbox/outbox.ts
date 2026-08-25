import type { ItemId } from "../api/types";
import { saidBy, Unreachable } from "../errors";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "../ports/store";
import type { Undo } from "../state/applied";
import type { ClientState } from "../state/state";
import type { Settlement } from "./handler";
import type { Operation, OperationId, PendingOperation } from "./operations";
import { applyOperation, opposes, targetOf } from "./registry";

export type Outbox = {
  enqueue(operation: Operation): Promise<void>;
  drain(): Promise<void>;
  dismiss(id: OperationId): Promise<void>;
  /** Which of these hydration read back, rather than this session enqueueing. */
  restored(ids: readonly OperationId[]): void;
};

export type OutboxDeps = {
  readonly state: Writable<ClientState>;
  readonly store: ClientStore;
  readonly send: (operation: Operation) => Promise<Settlement>;
  /**
   * What a refusal is reported with where the operation came out of the store
   * and has no reversal to run.
   */
  readonly reread: (item: ItemId) => Promise<void>;
  readonly now: () => string;
  readonly mint: () => OperationId;
};

export function createOutbox(deps: OutboxDeps): Outbox {
  /**
   * Reversals live here rather than in the store because a closure cannot be
   * written to disk. An operation read back from a durable store therefore has
   * none, and a refusal of one is settled by re-reading the item instead.
   */
  const undos = new Map<OperationId, Undo>();
  const chains = new Map<string, Promise<void>>();
  /** Claimed the moment a drain schedules one, so a second drain cannot re-send it. */
  const inflight = new Set<OperationId>();
  const restored = new Set<OperationId>();

  function record(entry: PendingOperation): Promise<void> {
    deps.state.update((state) => ({
      ...state,
      outbox: state.outbox.some((held) => held.id === entry.id)
        ? state.outbox.map((held) => (held.id === entry.id ? entry : held))
        : [...state.outbox, entry],
    }));

    return deps.store.writeOperation(entry);
  }

  function drop(id: OperationId): Promise<void> {
    undos.delete(id);
    restored.delete(id);
    deps.state.update((state) => ({
      ...state,
      outbox: state.outbox.filter((held) => held.id !== id),
    }));

    return deps.store.removeOperation(id);
  }

  async function enqueue(operation: Operation): Promise<void> {
    const at = deps.now();
    const opposed = deps.state.get().outbox.filter(
      (held) =>
        held.state !== "sending" &&
        // A drain claims an operation a turn before it is recorded as
        // sending, and what has been handed over cannot be taken back.
        !inflight.has(held.id) &&
        opposes(held.operation, operation),
    );

    // The stamp the person's device made when they acted is the key, so an
    // operation they made earlier does not win by arriving later.
    if (opposed.some((held) => held.at > at)) return;

    const applied = applyOperation(deps.state.get(), operation, at);
    deps.state.set(applied.state);

    // Neither reached the pool, and applying this one reversed the other, so
    // the pool is already right and there is nothing left to send.
    if (opposed.length > 0) {
      for (const held of opposed) await drop(held.id);
      return;
    }

    const entry: PendingOperation = {
      id: deps.mint(),
      operation,
      at,
      state: "pending",
    };
    undos.set(entry.id, applied.undo);
    await record(entry);
  }

  async function send(entry: PendingOperation): Promise<void> {
    await record({ ...entry, state: "sending" });

    try {
      const settlement = await deps.send(entry.operation);
      const revert = undos.get(entry.id) ?? ((state: ClientState) => state);
      deps.state.update((state) => settlement(state, revert));
      await drop(entry.id);
    } catch (error) {
      if (error instanceof Unreachable) {
        await record({
          ...entry,
          state: "unreachable",
          failure: saidBy(error),
        });
        return;
      }

      if (restored.has(entry.id)) {
        // A failed re-read leaves the cache as it stands, which is what an
        // unreachable pool leaves anyway; the refusal is still reported.
        await deps.reread(targetOf(entry.operation)).catch(() => undefined);
      } else {
        const undo = undos.get(entry.id);
        if (undo !== undefined) deps.state.update(undo);
        undos.delete(entry.id);
      }

      await record({ ...entry, state: "refused", failure: saidBy(error) });
    }
  }

  /** Operations against one item drain in order, so a tag never overtakes its capture. */
  function chain(target: string, work: () => Promise<void>): void {
    const previous = chains.get(target) ?? Promise.resolve();
    const next = previous.then(work, work);

    chains.set(target, next);
    void next.then(() => {
      if (chains.get(target) === next) chains.delete(target);
    });
  }

  /**
   * Re-scans after every wave, so an operation enqueued while this drain was
   * running still goes. `attempted` is what stops an unreachable one being
   * retried forever inside a single drain.
   */
  async function drain(): Promise<void> {
    const attempted = new Set<OperationId>();

    for (;;) {
      for (const entry of deps.state.get().outbox) {
        if (entry.state !== "pending" && entry.state !== "unreachable")
          continue;
        if (inflight.has(entry.id) || attempted.has(entry.id)) continue;

        attempted.add(entry.id);
        inflight.add(entry.id);
        chain(targetOf(entry.operation), async () => {
          try {
            await send(entry);
          } finally {
            inflight.delete(entry.id);
          }
        });
      }

      if (chains.size === 0) return;
      await Promise.allSettled([...chains.values()]);
    }
  }

  return {
    enqueue,
    drain,
    dismiss: drop,
    restored: (ids) => {
      for (const id of ids) restored.add(id);
    },
  };
}
