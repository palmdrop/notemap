import { describe, expect, it } from "vitest";

import type { BlobStore, PoolPorts, PoolStore } from "#types/api/ports";
import type { Asset, Dimensions, StoredBlob } from "#types/domain/asset";
import type { AssetId, BlobHash } from "#types/domain/ids";

import { png } from "#testing/pictures";

import { store } from "./assets";

const PHOTO = "photo" as AssetId;

/** Content-addressed the way a real one is, without a hash function to keep in step. */
function fakeBlobs(): BlobStore {
  return {
    put: async (bytes: AsyncIterable<Uint8Array>): Promise<StoredBlob> => {
      let content = "";
      for await (const chunk of bytes) {
        content += new TextDecoder().decode(chunk);
      }
      return { hash: `blob:${content}` as BlobHash, bytes: content.length };
    },
  } as unknown as BlobStore;
}

type Wired = PoolPorts & { readonly held: ReadonlyMap<AssetId, Asset> };

function ports(...held: readonly Asset[]): Wired {
  const assets = new Map(held.map((asset) => [asset.id, asset]));
  const tx = {
    asset: (id: AssetId) => Promise.resolve(assets.get(id)),
    insertAsset: (asset: Asset) => {
      if (assets.has(asset.id)) throw new Error(`${asset.id} is already held`);
      assets.set(asset.id, asset);
      return Promise.resolve();
    },
    measureAsset: (id: AssetId, dimensions: Dimensions) => {
      const held = assets.get(id);
      if (held !== undefined) assets.set(id, { ...held, dimensions });
      return Promise.resolve();
    },
  };

  const pool = {
    // Reading an id outside the transaction that inserts it is the race this
    // whole shape exists to close, so the double refuses to answer one.
    asset: () => {
      throw new Error("read an asset outside the transaction");
    },
    transaction: <T>(work: (transaction: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PoolStore;

  return { store: pool, blobs: fakeBlobs(), held: assets } as unknown as Wired;
}

async function* bytesOf(content: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(content);
}

function upload(
  wired: PoolPorts,
  content = "a picture",
  meta = { filename: "photo.png", mime: "image/png" },
) {
  return store(wired, PHOTO, bytesOf(content), meta);
}

describe("storing an asset under an id the uploader minted", () => {
  it("takes the id it was given rather than minting one", async () => {
    const wired = ports();

    const result = await upload(wired);

    expect(result).toEqual({
      kind: "ok",
      value: {
        kind: "stored",
        asset: {
          id: PHOTO,
          filename: "photo.png",
          mime: "image/png",
          blob: "blob:a picture",
          bytes: 9,
        },
      },
    });
  });

  it("answers the asset it already holds when the same upload arrives twice", async () => {
    const wired = ports();

    await upload(wired);
    const again = await upload(wired);

    expect(again).toEqual({
      kind: "ok",
      value: { kind: "already-stored", asset: wired.held.get(PHOTO) },
    });
    expect(wired.held.size).toBe(1);
  });

  it.each([
    [
      "bytes",
      "a different picture",
      { filename: "photo.png", mime: "image/png" },
    ],
    ["filename", "a picture", { filename: "other.png", mime: "image/png" }],
    ["media type", "a picture", { filename: "photo.png", mime: "image/jpeg" }],
  ])(
    "refuses an id already naming an asset differing in its %s",
    async (_difference, content, meta) => {
      const wired = ports();
      await upload(wired);

      const conflicting = await upload(wired, content, meta);

      expect(conflicting).toEqual({
        kind: "refused",
        refusal: { kind: "asset-id-conflict", asset: PHOTO },
      });
      expect(wired.held.get(PHOTO)).toMatchObject({
        filename: "photo.png",
        mime: "image/png",
        blob: "blob:a picture",
      });
    },
  );

  it("mints again under an id whose asset was swept", async () => {
    const wired = ports();
    await upload(wired);
    (wired.held as Map<AssetId, Asset>).delete(PHOTO);

    const result = await upload(wired, "a later picture", {
      filename: "later.png",
      mime: "image/png",
    });

    expect(result).toMatchObject({ kind: "ok", value: { kind: "stored" } });
  });
});

describe("measuring a picture as it is stored", () => {
  async function* bytesOfPicture(): AsyncIterable<Uint8Array> {
    yield png(640, 480);
  }

  it("keeps a picture's dimensions with the asset", async () => {
    const result = await store(ports(), PHOTO, bytesOfPicture(), {
      filename: "photo.png",
      mime: "image/png",
    });

    expect(result).toMatchObject({
      kind: "ok",
      value: { asset: { dimensions: { width: 640, height: 480 } } },
    });
  });

  it("measures one held without dimensions when it is uploaded again", async () => {
    const unmeasured = {
      id: PHOTO,
      filename: "photo.png",
      mime: "image/png",
      blob: `blob:${new TextDecoder().decode(png(640, 480))}` as Asset["blob"],
      bytes: 33,
    };
    const wired = ports(unmeasured);

    const result = await store(wired, PHOTO, bytesOfPicture(), {
      filename: "photo.png",
      mime: "image/png",
    });

    expect(result).toMatchObject({
      kind: "ok",
      value: {
        kind: "already-stored",
        asset: { dimensions: { width: 640, height: 480 } },
      },
    });
    expect(wired.held.get(PHOTO)?.dimensions).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("measures nothing the uploader did not call a picture", async () => {
    const result = await store(ports(), PHOTO, bytesOfPicture(), {
      filename: "photo.bin",
      mime: "application/octet-stream",
    });

    expect(result.kind === "ok" && result.value.asset.dimensions).toBe(
      undefined,
    );
  });
});
