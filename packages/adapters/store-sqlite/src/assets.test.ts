import type { AssetId, BlobHash, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendCapture,
  asset,
  at,
  capture,
  destination,
  frozenClock,
  putAssets,
  putDestinations,
  reserved,
  store,
} from "./testing/fixture";

const open: (() => Promise<void>)[] = [];

function pool(...args: Parameters<typeof store>) {
  const opened = store(...args);
  open.push(opened.cleanup);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((cleanup) => cleanup()));
});

const NEVER = at("2099-01-01T00:00:00.000Z");

describe("storing an asset", () => {
  it("reads back what it was given", async () => {
    const { pool: p } = pool();
    const stored = asset();

    await putAssets(p, stored);

    expect(await p.asset(stored.id)).toEqual(stored);
  });

  it("answers nothing for an id it does not hold", async () => {
    const { pool: p } = pool();

    expect(await p.asset("asset-nobody-minted" as AssetId)).toBeUndefined();
  });

  it("gives two names over one content two assets and one blob", async () => {
    const { pool: p, raw } = pool();

    await putAssets(
      p,
      asset({ id: "asset-1" as AssetId, filename: "mum.png" }),
      asset({ id: "asset-2" as AssetId, filename: "dad.png" }),
    );

    expect((await p.asset("asset-1" as AssetId))?.filename).toBe("mum.png");
    expect((await p.asset("asset-2" as AssetId))?.filename).toBe("dad.png");
    expect(raw.prepare("SELECT DISTINCT blob FROM assets").all()).toEqual([
      { blob: "blob-abc" },
    ]);
  });

  it("stamps when it was stored off the store's own clock", async () => {
    const clock = frozenClock("2026-08-03T09:00:00.000Z");
    const { pool: p, raw } = pool({ clock });

    await putAssets(p, asset());

    expect(raw.prepare("SELECT stored_at FROM assets").get()).toEqual({
      stored_at: Date.parse("2026-08-03T09:00:00.000Z"),
    });
  });
});

describe("releasing assets", () => {
  it("answers the blob that lost its last asset", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));

    const orphaned = await p.transaction((tx) =>
      tx.deleteAssets(["asset-1" as AssetId]),
    );

    expect(orphaned).toEqual(["blob-abc"]);
    expect(await p.asset("asset-1" as AssetId)).toBeUndefined();
  });

  it("keeps a blob two assets share when only one of them goes", async () => {
    const { pool: p } = pool();
    await putAssets(
      p,
      asset({ id: "asset-1" as AssetId }),
      asset({ id: "asset-2" as AssetId }),
    );

    const orphaned = await p.transaction((tx) =>
      tx.deleteAssets(["asset-1" as AssetId]),
    );

    expect(orphaned).toEqual([]);
    expect(await p.asset("asset-2" as AssetId)).toBeDefined();
  });

  it("orphans the blob once its second asset goes too", async () => {
    const { pool: p } = pool();
    await putAssets(
      p,
      asset({ id: "asset-1" as AssetId }),
      asset({ id: "asset-2" as AssetId }),
    );

    const orphaned = await p.transaction((tx) =>
      tx.deleteAssets(["asset-1" as AssetId, "asset-2" as AssetId]),
    );

    expect(orphaned).toEqual(["blob-abc"]);
  });

  it("refuses an asset an item still references, rather than losing its bytes", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));
    await appendCapture(
      p,
      capture({ assets: [{ slot: "image", asset: "asset-1" }] }),
    );

    await expect(
      p.transaction((tx) => tx.deleteAssets(["asset-1" as AssetId])),
    ).rejects.toThrow(/constraint/i);

    expect(await p.asset("asset-1" as AssetId)).toBeDefined();
  });

  it("refuses a capture naming an asset that was never stored", async () => {
    const { pool: p } = pool();

    await expect(
      appendCapture(
        p,
        capture({ assets: [{ slot: "image", asset: "asset-nobody-minted" }] }),
      ),
    ).rejects.toThrow(/constraint/i);
  });

  it("withholds a blob a routing record names as its output", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));
    await putDestinations(p, destination());
    const item = capture();
    await appendCapture(p, item);

    await p.transaction(async (tx) => {
      await tx.insertRoutingRecord(reserved(item));
      // The same bytes the asset named.
      await tx.resolveRoutingRecord(reserved(item).id, {
        output: {
          content: { blob: "blob-abc" as BlobHash, mediaType: "text/markdown" },
        },
      });
    });

    const orphaned = await p.transaction((tx) =>
      tx.deleteAssets(["asset-1" as AssetId]),
    );

    expect(orphaned).toEqual([]);
  });

  it("takes nothing when asked for nothing", async () => {
    const { pool: p } = pool();

    expect(await p.transaction((tx) => tx.deleteAssets([]))).toEqual([]);
  });
});

describe("the sweep's list", () => {
  it("holds an asset no item ever referenced", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));

    expect(await p.unreferencedAssets(NEVER, 10)).toEqual(["asset-1"]);
  });

  it("excludes one an item references", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));
    await appendCapture(
      p,
      capture({ assets: [{ slot: "image", asset: "asset-1" }] }),
    );

    expect(await p.unreferencedAssets(NEVER, 10)).toEqual([]);
  });

  it("excludes one stored on or after the instant asked about", async () => {
    const clock = frozenClock("2026-08-03T09:00:00.000Z");
    const { pool: p } = pool({ clock });
    await putAssets(p, asset({ id: "asset-1" as AssetId }));

    const stored = "2026-08-03T09:00:00.000Z" as Timestamp;
    expect(await p.unreferencedAssets(stored, 10)).toEqual([]);
    expect(
      await p.unreferencedAssets(at("2026-08-03T09:00:00.001Z"), 10),
    ).toEqual(["asset-1"]);
  });

  it("hands back no more than it was asked for, oldest first", async () => {
    const clock = frozenClock("2026-08-03T09:00:00.000Z");
    const { pool: p } = pool({ clock });

    await putAssets(p, asset({ id: "asset-1" as AssetId }));
    clock.set("2026-08-03T09:01:00.000Z");
    await putAssets(p, asset({ id: "asset-2" as AssetId }));

    expect(await p.unreferencedAssets(NEVER, 1)).toEqual(["asset-1"]);
    expect(await p.unreferencedAssets(NEVER, 10)).toEqual([
      "asset-1",
      "asset-2",
    ]);
  });
});
