import { describe, expect, it } from "vitest";

import type { PoolPorts, PoolStore, PoolTx } from "#types/api/ports";
import type { Action } from "#types/domain/action-log";
import type { ActionId, ItemId, Timestamp } from "#types/domain/ids";

import { observed } from "./observe";

const ACTION: Action = {
  id: "a1" as ActionId,
  kind: "captured",
  subject: "i1" as ItemId,
  by: { kind: "person" },
  at: "2026-09-20T12:00:00.000Z" as Timestamp,
  detail: {},
};

/** A store whose transaction commits by appending to `log` when work resolves. */
function storeWith(log: Action[]): PoolStore {
  return {
    transaction: async <T>(work: (tx: PoolTx) => Promise<T>) => {
      const staged: Action[] = [];
      const tx = {
        appendAction: async (action: Action) => {
          staged.push(action);
        },
      } as unknown as PoolTx;
      const result = await work(tx);
      log.push(...staged);
      return result;
    },
  } as unknown as PoolStore;
}

describe("observed ports", () => {
  it("are the same ports where nobody is listening", () => {
    const ports = { store: storeWith([]) } as unknown as PoolPorts;

    expect(observed(ports)).toBe(ports);
  });

  it("tell the observer each action after the transaction commits", async () => {
    const log: Action[] = [];
    const heard: { action: Action; committed: boolean }[] = [];
    const ports = observed({
      store: storeWith(log),
      observer: {
        action: (action) =>
          heard.push({ action, committed: log.includes(action) }),
      },
    } as unknown as PoolPorts);

    const answer = await ports.store.transaction(async (tx) => {
      await tx.appendAction(ACTION);
      await tx.appendAction({ ...ACTION, id: "a2" as ActionId, kind: "tagged" });
      expect(heard).toEqual([]);
      return "done";
    });

    expect(answer).toBe("done");
    expect(heard.map((each) => each.action.kind)).toEqual([
      "captured",
      "tagged",
    ]);
    expect(heard.every((each) => each.committed)).toBe(true);
  });

  it("tell the observer nothing about a transaction that rolled back", async () => {
    const heard: Action[] = [];
    const ports = observed({
      store: storeWith([]),
      observer: { action: (action) => heard.push(action) },
    } as unknown as PoolPorts);

    await expect(
      ports.store.transaction(async (tx) => {
        await tx.appendAction(ACTION);
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");

    expect(heard).toEqual([]);
  });

  it("do not fail a committed write over an observer that threw", async () => {
    const ports = observed({
      store: storeWith([]),
      observer: {
        action: () => {
          throw new Error("observer bug");
        },
      },
    } as unknown as PoolPorts);

    const escaped = new Promise<unknown>((resolve) => {
      process.once("uncaughtException", resolve);
    });

    await expect(
      ports.store.transaction(async (tx) => {
        await tx.appendAction(ACTION);
        return "committed";
      }),
    ).resolves.toBe("committed");

    await expect(escaped).resolves.toMatchObject({ message: "observer bug" });
  });
});
