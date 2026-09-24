import { describe, expect, it } from "vitest";

import { change, list, POOL_SETTINGS } from "./settings";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolStore, PoolTx } from "#types/api/ports";
import type { Action } from "#types/domain/action-log";
import type { MintableId, PoolSettingName, Timestamp } from "#types/domain/ids";
import type { Job } from "#types/domain/work";
import type { PoolSettingRecord } from "#types/domain/pool-setting";

const UNFURL = "unfurl" as PoolSettingName;
const SECOND = "second" as PoolSettingName;

const CONFIG: PoolConfig = {
  poolSettings: [
    { name: UNFURL, type: "boolean", default: true },
    { name: SECOND, type: "boolean", default: false },
  ],
} as unknown as PoolConfig;

type Wired = PoolPorts & {
  readonly held: PoolSettingRecord[];
  readonly appended: readonly Action[];
  readonly enqueued: readonly Job[];
};

function ports(held: readonly PoolSettingRecord[] = []): Wired {
  const rows = [...held];
  const appended: Action[] = [];
  const enqueued: Job[] = [];
  let minted = 0;
  let ticks = 0;

  const reads = {
    poolSettings: async (): Promise<readonly PoolSettingRecord[]> => [...rows],
  };

  const tx = {
    ...reads,
    setPoolSetting: async (record: PoolSettingRecord): Promise<void> => {
      const at = rows.findIndex((each) => each.name === record.name);
      if (at === -1) rows.push(record);
      else rows[at] = record;
    },
    appendAction: async (action: Action): Promise<void> => {
      appended.push(action);
    },
    enqueue: async (jobs: readonly Job[]): Promise<void> => {
      enqueued.push(...jobs);
    },
  } as unknown as PoolTx;

  const store = {
    ...reads,
    transaction: <T>(work: (handle: PoolTx) => Promise<T>) => work(tx),
  } as unknown as PoolStore;

  return {
    held: rows,
    appended,
    enqueued,
    store,
    mirrorWriter: {} as PoolPorts["mirrorWriter"],
    clock: {
      now: () => `2026-09-24T10:00:0${String(ticks++)}.000Z` as Timestamp,
    },
    ids: {
      next: <T extends MintableId>() => `minted-${String(++minted)}` as T,
    },
  } as unknown as Wired;
}

describe("POOL_SETTINGS", () => {
  it("declares one known setting, unfurl, a boolean defaulting to on", () => {
    expect(POOL_SETTINGS).toEqual([
      { name: "unfurl", type: "boolean", default: true },
    ]);
  });
});

describe("reading pool settings", () => {
  it("answers every known setting's default before anything is written", async () => {
    const wired = ports();
    expect(await list(CONFIG, wired)).toEqual([
      { name: UNFURL, value: true },
      { name: SECOND, value: false },
    ]);
  });

  it("answers a changed setting's stored value, and the rest at their default", async () => {
    const wired = ports([
      {
        name: UNFURL,
        value: false,
        changedAt: "2026-09-24T09:00:00.000Z" as Timestamp,
      },
    ]);
    expect(await list(CONFIG, wired)).toEqual([
      { name: UNFURL, value: false },
      { name: SECOND, value: false },
    ]);
  });

  it("ignores a row naming a setting this config does not ship", async () => {
    const wired = ports([
      {
        name: "ghost" as PoolSettingName,
        value: true,
        changedAt: "2026-09-24T09:00:00.000Z" as Timestamp,
      },
    ]);
    expect(await list(CONFIG, wired)).toEqual([
      { name: UNFURL, value: true },
      { name: SECOND, value: false },
    ]);
  });
});

describe("changing a pool setting", () => {
  it("is readable back", async () => {
    const wired = ports();
    const result = await change(CONFIG, wired, UNFURL, false);

    expect(result).toEqual({
      kind: "ok",
      value: { name: UNFURL, value: false },
    });
    expect(await list(CONFIG, wired)).toEqual([
      { name: UNFURL, value: false },
      { name: SECOND, value: false },
    ]);
  });

  it("writes exactly one action naming the setting and both values", async () => {
    const wired = ports();
    await change(CONFIG, wired, UNFURL, false);

    expect(wired.appended).toEqual([
      expect.objectContaining({
        kind: "pool-setting-changed",
        detail: { setting: UNFURL, from: true, to: false },
      }),
    ]);
    // A pool setting is not an item, so the entry names it in its detail instead.
    expect(wired.appended[0]?.subject).toBeUndefined();
  });

  it("carries the value before the change, not the default, on a second change", async () => {
    const wired = ports([
      {
        name: UNFURL,
        value: false,
        changedAt: "2026-09-24T09:00:00.000Z" as Timestamp,
      },
    ]);
    await change(CONFIG, wired, UNFURL, true);

    expect(wired.appended).toEqual([
      expect.objectContaining({
        detail: { setting: UNFURL, from: false, to: true },
      }),
    ]);
  });

  it("still writes a row when the value equals the default", async () => {
    const wired = ports();
    await change(CONFIG, wired, UNFURL, true);

    expect(wired.held).toEqual([
      expect.objectContaining({ name: UNFURL, value: true }),
    ]);
  });

  it("enqueues one mirror write naming the setting", async () => {
    const wired = ports();
    await change(CONFIG, wired, UNFURL, false);

    expect(wired.enqueued).toEqual([
      expect.objectContaining({
        kind: "mirror",
        subject: { kind: "pool-setting", setting: UNFURL },
      }),
    ]);
  });

  it("refuses a name the running code does not know, and writes nothing", async () => {
    const wired = ports();
    const result = await change(
      CONFIG,
      wired,
      "ghost" as PoolSettingName,
      true,
    );

    expect(result).toEqual({
      kind: "refused",
      refusal: {
        kind: "unknown-pool-setting",
        setting: "ghost",
        allowed: [UNFURL, SECOND],
      },
    });
    expect(wired.held).toEqual([]);
    expect(wired.appended).toEqual([]);
  });

  it("refuses a value of the wrong type, and writes nothing", async () => {
    const wired = ports();
    const result = await change(CONFIG, wired, UNFURL, "yes" as never);

    expect(result).toEqual({
      kind: "refused",
      refusal: {
        kind: "pool-setting-invalid",
        setting: UNFURL,
        expected: "boolean",
      },
    });
    expect(wired.held).toEqual([]);
  });

  it("behaves against the list a pool was handed, not against any list of its own", async () => {
    const bare: PoolConfig = { poolSettings: [] } as unknown as PoolConfig;
    const wired = ports();

    const result = await change(bare, wired, UNFURL, true);

    expect(result).toEqual({
      kind: "refused",
      refusal: { kind: "unknown-pool-setting", setting: UNFURL, allowed: [] },
    });
  });
});
