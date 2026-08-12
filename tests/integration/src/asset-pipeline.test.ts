import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BlobHash, Duration, PoolConfig } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  CONFIG,
  drainWith,
  envelope,
  filesUnder,
  harness,
  storedRecord,
  upload,
  type Harness,
} from "./fixture";

const open: Harness[] = [];

function pool(config: PoolConfig = CONFIG): Harness {
  const started = harness(config, "filesystem");
  open.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((started) => started.cleanup()));
});

/** No grace at all, so a sweep takes anything unreferenced that is not brand new. */
const IMPATIENT: PoolConfig = { ...CONFIG, sweep: { grace: 0 as Duration } };

/**
 * The window is `stored_at < now - grace`, strictly, so even a zero grace needs
 * the clock to have moved: an asset stored this instant is not yet older than
 * this instant.
 */
function aMomentLater(started: Harness): void {
  started.clock.set("2026-08-06T09:00:01.000Z");
}

function blobAt(assetRoot: string, blob: BlobHash): string {
  return join(assetRoot, blob.slice(0, 2), blob);
}

async function present(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

describe("upload, capture, drain", () => {
  it("leaves the pool, the blob and the mirror pair all saying the same thing", async () => {
    const started = pool();
    const content = bytes("a picture of mum");
    const asset = await upload(started.pool, "mum.png", content);

    const captured = await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: asset.id }] }),
    );
    if (captured.kind !== "ok") throw new Error("expected a capture");

    expect(await drainWith(started)()).toBe(1);

    // The pool.
    const item = await started.pool.items.get(captured.value.item.id);
    expect(item?.payload.assets).toEqual([{ slot: "image", asset: asset.id }]);

    // The blob, where the record says it is.
    expect(await readFile(blobAt(started.assetRoot, asset.blob), "utf8")).toBe(
      "a picture of mum",
    );

    // The mirror pair: a record naming the asset, and a rendering beside it.
    const record = await storedRecord(started.mirrorRoot);
    expect(record.item.id).toBe(item?.id);
    expect(record.assets).toEqual([asset]);
    expect(await filesUnder(started.mirrorRoot)).toHaveLength(2);
  });

  it("keeps the filename in the record, where a person without notemap finds it", async () => {
    const started = pool();
    const asset = await upload(
      started.pool,
      "interview-with-mum.opus",
      bytes("audio"),
      "audio/ogg",
    );
    await started.pool.capture(
      envelope({ assets: [{ slot: "recording", asset: asset.id }] }),
    );
    await drainWith(started)();

    const record = await storedRecord(started.mirrorRoot);

    expect(record.assets[0]).toMatchObject({
      filename: "interview-with-mum.opus",
      mime: "audio/ogg",
      blob: asset.blob,
    });
  });
});

describe("an upload whose capture never arrives", () => {
  it("is gone after a sweep, and its blob with it", async () => {
    const started = pool(IMPATIENT);
    const asset = await upload(started.pool, "abandoned.png", bytes("orphan"));
    const path = blobAt(started.assetRoot, asset.blob);

    expect(await present(path)).toBe(true);

    aMomentLater(started);
    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual([
      asset.id,
    ]);

    expect(await started.pool.assets.get(asset.id)).toBeUndefined();
    expect(await present(path)).toBe(false);
  });

  it("takes nothing from an item that arrived in time", async () => {
    const started = pool(IMPATIENT);
    const kept = await upload(started.pool, "kept.png", bytes("kept"));
    const dropped = await upload(started.pool, "dropped.png", bytes("dropped"));

    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: kept.id }] }),
    );
    await drainWith(started)();

    aMomentLater(started);
    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual([
      dropped.id,
    ]);

    // The mirror still points at a file that is there.
    const record = await storedRecord(started.mirrorRoot);
    expect(record.assets).toEqual([kept]);
    expect(await present(blobAt(started.assetRoot, kept.blob))).toBe(true);
    expect(await present(blobAt(started.assetRoot, dropped.blob))).toBe(false);
  });
});

describe("two items over one blob", () => {
  it("both keep it when a sweep runs against the pool", async () => {
    const started = pool(IMPATIENT);
    const content = bytes("the same picture");
    const mine = await upload(started.pool, "mum.png", content);
    const theirs = await upload(started.pool, "dad.png", content);

    await started.pool.capture(
      envelope({
        id: "item-1",
        sourceItemId: "src-1",
        assets: [{ slot: "image", asset: mine.id }],
      }),
    );
    await started.pool.capture(
      envelope({
        id: "item-2",
        sourceItemId: "src-2",
        assets: [{ slot: "image", asset: theirs.id }],
      }),
    );
    await drainWith(started)();

    aMomentLater(started);
    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual(
      [],
    );

    expect((await started.pool.assets.get(mine.id))?.filename).toBe("mum.png");
    expect((await started.pool.assets.get(theirs.id))?.filename).toBe(
      "dad.png",
    );
    expect(mine.blob).toBe(theirs.blob);
    expect(await present(blobAt(started.assetRoot, mine.blob))).toBe(true);
  });

  it("keeps the blob when one of the two assets is swept and the other is not", async () => {
    const started = pool(IMPATIENT);
    const content = bytes("the same picture");
    const kept = await upload(started.pool, "mum.png", content);
    const gone = await upload(started.pool, "dad.png", content);

    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: kept.id }] }),
    );

    aMomentLater(started);
    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual([
      gone.id,
    ]);

    expect(await present(blobAt(started.assetRoot, kept.blob))).toBe(true);
    const opened = await started.pool.assets.open(kept.id);
    expect(opened.kind).toBe("ok");
  });
});
