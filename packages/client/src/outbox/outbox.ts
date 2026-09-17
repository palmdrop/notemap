import type { ItemId } from "#api/types";
import { saidBy, Unauthenticated, Unreachable } from "../errors";
import type { Writable } from "../observable/observable";
import type { ClientStore } from "#ports/store";
import type { Undo } from "#state/applied";
import type { ClientState } from "#state/state";
import type { Settlement } from "./handler";
import {
  attemptable,
  type Operation,
  type OperationId,
  type PendingOperation,
} from "./operations";
import { applyOperation, opposes, targetOf } from "./registry";

export type Outbox = {
  enqueue(operation: Operation): Promise<void>;
  /** Answers when the soonest lease it left alone lapses, if it left one. */
  drain(): Promise<string | undefined>;
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
  /** An operation that has left the outbox for good: landed, or dismissed. */
  readonly released: (operation: Operation) => Promise<void>;
  readonly report: (error: unknown) => void;
  readonly now: () => string;
  readonly mint: () => OperationId;
};

/**
 * Long enough that a slow upload is not taken over while it is still going;
 * short enough that a capture whose process died mid-send is not stranded.
 */
const LEASE_MS = 60_000;

function unleased(entry: PendingOperation): PendingOperation {
  const { until: _, ...rest } = entry;
  return rest;
}

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
  /** Every id this process has held, so a stale read of the store cannot bring one back. */
  const seen = new Set<OperationId>();

  function hold(entry: PendingOperation): void {
    seen.add(entry.id);
    deps.state.update((state) => ({
      ...state,
      outbox: state.outbox.some((held) => held.id === entry.id)
        ? state.outbox.map((held) => (held.id === entry.id ? entry : held))
        : [...state.outbox, entry],
    }));
  }

  /**
   * The store before the state. An entry held in state the store has not got
   * yet is one a drain can claim and then fail to lease, which reads as another
   * process having taken it — and `seen` would keep this process from ever
   * taking it back, leaving it on disk for whichever process comes next.
   */
  async function record(entry: PendingOperation): Promise<void> {
    await deps.store.writeOperation(entry);
    hold(entry);
  }

  /** Left the outbox by another process's hand: nothing here to release. */
  function forget(id: OperationId): void {
    undos.delete(id);
    restored.delete(id);
    deps.state.update((state) => ({
      ...state,
      outbox: state.outbox.filter((entry) => entry.id !== id),
    }));
  }

  /**
   * The store is what other processes over it write to, so a drain reads it
   * back first. What this process enqueued is its own to describe; what it read
   * back from the store is whatever the store says now — landed by another
   * process and gone, or leased by one and left alone — and what another
   * process has enqueued since is taken up.
   */
  async function reconciled(): Promise<void> {
    let held: readonly PendingOperation[];
    try {
      held = await deps.store.readOutbox();
    } catch (error) {
      deps.report(error);
      return;
    }

    const stored = new Map(held.map((entry) => [entry.id, entry]));
    const theirs = (id: OperationId) => restored.has(id) && !inflight.has(id);

    deps.state.update((state) => {
      const kept = state.outbox.flatMap((entry) => {
        if (!theirs(entry.id)) return [entry];
        const now = stored.get(entry.id);
        if (now !== undefined) return [now];

        undos.delete(entry.id);
        restored.delete(entry.id);
        return [];
      });
      const added = held.filter((entry) => !seen.has(entry.id));

      for (const entry of added) {
        seen.add(entry.id);
        restored.add(entry.id);
      }

      return { ...state, outbox: [...kept, ...added] };
    });
  }

  async function drop(id: OperationId): Promise<void> {
    const held = deps.state.get().outbox.find((entry) => entry.id === id);
    undos.delete(id);
    restored.delete(id);
    deps.state.update((state) => ({
      ...state,
      outbox: state.outbox.filter((entry) => entry.id !== id),
    }));

    await deps.store.removeOperation(id);
    if (held !== undefined) await deps.released(held.operation);
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
    const now = deps.now();
    const until = new Date(Date.parse(now) + LEASE_MS).toISOString();
    const leased = await deps.store.leaseOperation(entry.id, now, until);

    // Another process got there first: the store's word on it is taken over
    // this one's, and it is left to whoever holds it.
    if (leased === undefined) {
      const theirs = (await deps.store.readOutbox()).find(
        (held) => held.id === entry.id,
      );
      if (theirs === undefined) {
        forget(entry.id);
      } else {
        restored.add(entry.id);
        hold(theirs);
      }
      return;
    }

    hold(leased);

    try {
      const settlement = await deps.send(entry.operation);
      const revert = undos.get(entry.id) ?? ((state: ClientState) => state);

      // Dropped before the settlement, so the emission that draws the pool's
      // answer is the one that stops drawing bytes released with it.
      await drop(entry.id);
      deps.state.update((state) => settlement(state, revert));
    } catch (error) {
      // A door that is shut parks the entry exactly as silence does. Marking it
      // refused would be terminal, and a session that lapsed while the shell was
      // away would burn every capture waiting behind it.
      if (error instanceof Unreachable || error instanceof Unauthenticated) {
        await record({
          ...unleased(entry),
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

      await record({
        ...unleased(entry),
        state: "refused",
        failure: saidBy(error),
      });
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
  async function drain(): Promise<string | undefined> {
    const attempted = new Set<OperationId>();
    let leased: string | undefined;

    function wave(eligible: (entry: PendingOperation) => boolean): void {
      const now = deps.now();

      for (const entry of deps.state.get().outbox) {
        if (!eligible(entry)) continue;
        if (inflight.has(entry.id) || attempted.has(entry.id)) continue;
        if (!attemptable(entry, now)) {
          if (
            entry.state === "sending" &&
            entry.until !== undefined &&
            (leased === undefined || entry.until < leased)
          ) {
            leased = entry.until;
          }
          continue;
        }

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
    }

    // What this process enqueued is claimed before anything yields, so an
    // opposing enqueue arriving meanwhile cannot take back what is handed over.
    // What came out of the store is claimed only once the store has been asked
    // again, since another process may have landed or leased it since.
    wave((entry) => !restored.has(entry.id));
    await reconciled();

    for (;;) {
      wave(() => true);
      if (chains.size === 0) return leased;
      await Promise.allSettled([...chains.values()]);
    }
  }

  return {
    enqueue,
    drain,
    dismiss: drop,
    restored: (ids) => {
      for (const id of ids) {
        seen.add(id);
        restored.add(id);
      }
    },
  };
}
