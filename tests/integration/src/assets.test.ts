import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AssetId, BlobHash, Page } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  collect,
  envelope,
  filesUnder,
  harness,
  itemRecord,
  streamOf,
  upload,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };

const open: Harness[] = [];

function pool(...args: Parameters<typeof harness>): Harness {
  const started = harness(...args);
  open.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((started) => started.cleanup()));
});

/** Where the blob driver puts a blob, as a person reading the mirror would find it. */
function blobAt(assetRoot: string, blob: BlobHash): string {
  return join(assetRoot, blob.slice(0, 2), blob);
}

/** A day is the fixture's grace, so this is comfortably outside it. */
function pastTheGrace(started: Harness): void {
  started.clock.set("2026-08-08T09:00:00.000Z");
}

describe("storing bytes", () => {
  it("gives two names over one content two assets and one blob", async () => {
    const { pool: p } = pool();
    const content = bytes("the same picture");

    const mine = await upload(p, "mum.png", content);
    const theirs = await upload(p, "dad.png", content);

    expect(mine.id).not.toBe(theirs.id);
    expect(mine.blob).toBe(theirs.blob);
    expect((await p.assets.get(mine.id))?.filename).toBe("mum.png");
    expect((await p.assets.get(theirs.id))?.filename).toBe("dad.png");
  });

  it("answers the asset it holds when the same upload arrives again", async () => {
    const { pool: p } = pool();
    const id = "minted-once" as AssetId;

    const first = await p.assets.store(id, streamOf(bytes("a picture")), {
      filename: "photo.png",
      mime: "image/png",
    });
    const again = await p.assets.store(id, streamOf(bytes("a picture")), {
      filename: "photo.png",
      mime: "image/png",
    });

    expect(first).toMatchObject({ value: { kind: "stored" } });
    expect(again).toEqual({
      kind: "ok",
      value: {
        kind: "already-stored",
        asset: await p.assets.get(id),
      },
    });
  });

  it.each([
    ["its bytes", "a different picture", "photo.png", "image/png"],
    ["its filename", "a picture", "other.png", "image/png"],
    ["its media type", "a picture", "photo.png", "image/jpeg"],
  ])(
    "refuses an id already naming an asset differing in %s, and keeps the one it holds",
    async (_difference, content, filename, mime) => {
      const { pool: p } = pool();
      const id = "minted-once" as AssetId;
      await p.assets.store(id, streamOf(bytes("a picture")), {
        filename: "photo.png",
        mime: "image/png",
      });

      const conflicting = await p.assets.store(id, streamOf(bytes(content)), {
        filename,
        mime,
      });

      expect(conflicting).toEqual({
        kind: "refused",
        refusal: { kind: "asset-id-conflict", asset: id },
      });
      expect(await p.assets.get(id)).toMatchObject({
        filename: "photo.png",
        mime: "image/png",
      });
    },
  );

  it("hands back exactly the bytes it was given, for content that is not text", async () => {
    const { pool: p } = pool();
    const content = new Uint8Array([0, 0xff, 0xfe, 0x80, 0]);

    const asset = await upload(
      p,
      "raw.bin",
      content,
      "application/octet-stream",
    );
    const opened = await p.assets.open(asset.id);

    expect(opened.kind).toBe("ok");
    if (opened.kind !== "ok") return;
    expect(await collect(opened.value)).toEqual(content);
  });

  it("records the size and the media type it was told", async () => {
    const { pool: p } = pool();

    const asset = await upload(p, "photo.png", bytes("12345"), "image/png");

    expect(asset).toMatchObject({ mime: "image/png", bytes: 5 });
  });

  it("refuses to open an asset nobody minted", async () => {
    const { pool: p } = pool();

    const opened = await p.assets.open("asset-nobody-minted" as AssetId);

    expect(opened).toEqual({
      kind: "refused",
      refusal: { kind: "no-such-asset", asset: "asset-nobody-minted" },
    });
  });

  it("says the blob is gone rather than the asset, when the bytes go", async () => {
    const { pool: p, assetRoot } = pool();
    const asset = await upload(p, "photo.png", bytes("a picture"));

    await rm(assetRoot, { recursive: true });

    expect(await p.assets.open(asset.id)).toEqual({
      kind: "refused",
      refusal: { kind: "blob-missing", blob: asset.blob },
    });
    expect(await p.assets.get(asset.id)).toBeDefined();
  });
});

describe("verifying", () => {
  it("calls an untouched blob intact and an edited one drifted", async () => {
    const { pool: p, assetRoot } = pool();
    const asset = await upload(p, "photo.png", bytes("a picture"));

    expect(await p.assets.verify(asset.id)).toBe("intact");

    await writeFile(blobAt(assetRoot, asset.blob), "edited outside notemap");

    expect(await p.assets.verify(asset.id)).toBe("drifted");
  });

  it("reports an asset nobody minted as missing rather than throwing", async () => {
    const { pool: p } = pool();

    expect(await p.assets.verify("asset-nobody-minted" as AssetId)).toBe(
      "missing",
    );
  });
});

describe("capturing against an asset", () => {
  it("takes the reference when the asset resolves", async () => {
    const { pool: p } = pool();
    const asset = await upload(p, "photo.png", bytes("a picture"));

    const result = await p.capture(
      envelope({ assets: [{ slot: "image", asset: asset.id }] }),
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.item.payload.assets).toEqual([
      { slot: "image", asset: asset.id },
    ]);
  });

  it("refuses one quoting an asset nobody minted, and writes nothing", async () => {
    const { pool: p } = pool();

    const result = await p.capture(
      envelope({ assets: [{ slot: "image", asset: "asset-nobody-minted" }] }),
    );

    expect(result).toEqual({
      kind: "refused",
      refusal: { kind: "unknown-asset", asset: "asset-nobody-minted" },
    });
    expect((await p.views.feed({ limit: 10 })).values).toEqual([]);
    expect((await p.actions.all(ALL)).values).toEqual([]);
  });
});

describe("the sweep", () => {
  it("leaves an upload alone inside the grace window", async () => {
    const started = pool();
    const asset = await upload(started.pool, "photo.png", bytes("a picture"));

    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual(
      [],
    );
    expect(await started.pool.assets.get(asset.id)).toBeDefined();
  });

  it("takes an upload no capture ever claimed, and its blob with it", async () => {
    const started = pool();
    const asset = await upload(started.pool, "photo.png", bytes("a picture"));

    pastTheGrace(started);
    const swept = await started.pool.maintenance.sweepUnreferencedAssets();

    expect(swept).toEqual([asset.id]);
    expect(await started.pool.assets.get(asset.id)).toBeUndefined();
    expect(await started.pool.assets.verify(asset.id)).toBe("missing");
  });

  it("leaves an asset an item references, however old it is", async () => {
    const started = pool();
    const asset = await upload(started.pool, "photo.png", bytes("a picture"));
    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: asset.id }] }),
    );

    pastTheGrace(started);

    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual(
      [],
    );
    expect(await started.pool.assets.get(asset.id)).toBeDefined();
  });

  it("keeps a blob two assets share when only one of them is swept", async () => {
    const started = pool();
    const content = bytes("the same picture");
    const kept = await upload(started.pool, "mum.png", content);
    const gone = await upload(started.pool, "dad.png", content);
    await started.pool.capture(
      envelope({ assets: [{ slot: "image", asset: kept.id }] }),
    );

    pastTheGrace(started);
    const swept = await started.pool.maintenance.sweepUnreferencedAssets();

    expect(swept).toEqual([gone.id]);
    expect(await started.pool.assets.verify(kept.id)).toBe("intact");
    const opened = await started.pool.assets.open(kept.id);
    expect(opened.kind).toBe("ok");
  });

  it("appends one entry for a run, not one per asset", async () => {
    const started = pool();
    const first = await upload(started.pool, "one.png", bytes("one"));
    const second = await upload(started.pool, "two.png", bytes("two"));

    pastTheGrace(started);
    await started.pool.maintenance.sweepUnreferencedAssets();

    const logged = (await started.pool.actions.all(ALL)).values.filter(
      (action) => action.kind === "assets-released",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ by: { kind: "notemap" } });
    expect(logged[0]?.detail["assets"]).toEqual([first.id, second.id]);
  });

  it("appends nothing when there was nothing to take", async () => {
    const started = pool();

    pastTheGrace(started);
    await started.pool.maintenance.sweepUnreferencedAssets();

    expect((await started.pool.actions.all(ALL)).values).toEqual([]);
  });
});

describe("the mirror record", () => {
  it("carries the filename beside the blob the reference names", async () => {
    const { pool: p } = pool();
    const asset = await upload(p, "interview-with-mum.opus", bytes("audio"));
    const captured = await p.capture(
      envelope({ assets: [{ slot: "recording", asset: asset.id }] }),
    );
    if (captured.kind !== "ok") throw new Error("expected a capture");

    const record = await itemRecord(p, captured.value.item.id);

    expect(record?.assets).toEqual([asset]);
  });

  it("is projected without reaching the blob store at all", async () => {
    const { pool: p, assetRoot } = pool();
    const asset = await upload(p, "photo.png", bytes("a picture"));
    const captured = await p.capture(
      envelope({ assets: [{ slot: "image", asset: asset.id }] }),
    );
    if (captured.kind !== "ok") throw new Error("expected a capture");

    await rm(assetRoot, { recursive: true });

    await expect(itemRecord(p, captured.value.item.id)).resolves.toMatchObject({
      assets: [asset],
    });
  });
});

describe("the blobs on disk", () => {
  it("stores one copy of content two assets share", async () => {
    const { pool: p } = pool();
    const content = bytes("the same picture");

    const mine = await upload(p, "mum.png", content);
    await upload(p, "dad.png", content);

    const opened = await p.assets.open(mine.id);
    if (opened.kind !== "ok") throw new Error("expected the bytes");
    expect(await collect(opened.value)).toEqual(content);
  });

  it("accepts a stream that arrives in pieces", async () => {
    const { pool: p } = pool();

    const stored = await p.assets.store(
      "counted-in-pieces" as AssetId,
      streamOf(bytes("one "), bytes("two ")),
      { filename: "counted.txt", mime: "text/plain" },
    );

    expect(stored).toMatchObject({
      kind: "ok",
      value: { kind: "stored", asset: { bytes: 8 } },
    });
  });
});

describe("where the bytes land", () => {
  /**
   * The bytes are hashed before the row is read, so a refused upload leaves a
   * blob nothing names. Deleting it would be wrong — another asset may name the
   * same content — so it is space, and asserted here rather than left to be
   * discovered.
   */
  it("keeps the blob a refused upload wrote, and no sweep takes it", async () => {
    const started = pool();
    const id = "minted-once" as AssetId;
    const meta = { filename: "photo.png", mime: "image/png" };
    await started.pool.assets.store(id, streamOf(bytes("a picture")), meta);
    const before = await filesUnder(started.assetRoot);

    const refused = await started.pool.assets.store(
      id,
      streamOf(bytes("something else")),
      meta,
    );

    expect(refused.kind).toBe("refused");
    const orphaned = (await filesUnder(started.assetRoot)).filter(
      (file) => !before.includes(file),
    );
    expect(orphaned).toHaveLength(1);

    // The sweep reads the asset table, so it takes the asset and the blob that
    // asset named, and walks past the one the refusal left.
    pastTheGrace(started);
    expect(await started.pool.maintenance.sweepUnreferencedAssets()).toEqual([
      id,
    ]);
    expect(await filesUnder(started.assetRoot)).toEqual(orphaned);
  });

  it("is findable from the record alone, without notemap", async () => {
    const { pool: p, assetRoot } = pool();
    const asset = await upload(p, "photo.png", bytes("a picture"));

    // What a person reading the mirror does: take the blob hash and look.
    expect(await readFile(blobAt(assetRoot, asset.blob), "utf8")).toBe(
      "a picture",
    );
  });
});
