import { afterEach, describe, expect, it } from "vitest";

import type { PoolSettingName } from "@notemap/core";

import type { SqlitePoolStore } from "./pool-store";
import { at, store } from "./testing/fixture";

const UNFURL = "unfurl" as PoolSettingName;
const SECOND = "second" as PoolSettingName;

const opened: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of opened.splice(0)) await cleanup();
});

function pool(): { pool: SqlitePoolStore } {
  const created = store();
  opened.push(created.cleanup);
  return created;
}

describe("the settings a pool holds", () => {
  it("answers nothing before anything is written", async () => {
    const { pool: p } = pool();
    expect(await p.poolSettings()).toEqual([]);
  });

  it("reads back what was written", async () => {
    const { pool: p } = pool();
    await p.transaction((tx) =>
      tx.setPoolSetting({
        name: UNFURL,
        value: false,
        changedAt: at("2026-09-24T09:00:00.000Z"),
      }),
    );

    expect(await p.poolSettings()).toEqual([
      { name: UNFURL, value: false, changedAt: at("2026-09-24T09:00:00.000Z") },
    ]);
  });

  it("replaces a rewrite of the same name rather than accumulating a second row", async () => {
    const { pool: p } = pool();
    await p.transaction((tx) =>
      tx.setPoolSetting({
        name: UNFURL,
        value: false,
        changedAt: at("2026-09-24T09:00:00.000Z"),
      }),
    );
    await p.transaction((tx) =>
      tx.setPoolSetting({
        name: UNFURL,
        value: true,
        changedAt: at("2026-09-24T10:00:00.000Z"),
      }),
    );

    expect(await p.poolSettings()).toEqual([
      { name: UNFURL, value: true, changedAt: at("2026-09-24T10:00:00.000Z") },
    ]);
  });

  it("holds one row per name, independently", async () => {
    const { pool: p } = pool();
    await p.transaction(async (tx) => {
      await tx.setPoolSetting({
        name: UNFURL,
        value: false,
        changedAt: at("2026-09-24T09:00:00.000Z"),
      });
      await tx.setPoolSetting({
        name: SECOND,
        value: true,
        changedAt: at("2026-09-24T09:00:01.000Z"),
      });
    });

    expect((await p.poolSettings()).map((each) => each.name).sort()).toEqual([
      SECOND,
      UNFURL,
    ]);
  });

  it("is visible inside the transaction that wrote it, before it commits", async () => {
    const { pool: p } = pool();
    await p.transaction(async (tx) => {
      await tx.setPoolSetting({
        name: UNFURL,
        value: false,
        changedAt: at("2026-09-24T09:00:00.000Z"),
      });
      expect(await tx.poolSettings()).toEqual([
        {
          name: UNFURL,
          value: false,
          changedAt: at("2026-09-24T09:00:00.000Z"),
        },
      ]);
    });
  });
});
