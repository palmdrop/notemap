import { describe, expect, it } from "vitest";

import type { PoolPorts } from "#types/api/ports";
import type { Asset, Dimensions } from "#types/domain/asset";
import type { AssetId, BlobHash } from "#types/domain/ids";
import { png } from "#testing/pictures";

import { measurePictures } from "./maintenance";

function picture(id: string, blob: string): Asset {
  return {
    id: id as AssetId,
    filename: `${id}.png`,
    mime: "image/png",
    blob: blob as BlobHash,
    bytes: 33,
  };
}

function ports(
  held: readonly Asset[],
  blobs: Readonly<Record<string, Uint8Array>>,
) {
  const measured = new Map<AssetId, Dimensions>();
  const wired = {
    store: {
      unmeasuredPictures: (after: AssetId | undefined, limit: number) =>
        Promise.resolve(
          held
            .filter((asset) => !measured.has(asset.id))
            .filter((asset) => after === undefined || asset.id > after)
            .slice(0, limit),
        ),
      transaction: <T>(work: (tx: unknown) => Promise<T>) =>
        work({
          measureAsset: (id: AssetId, dimensions: Dimensions) => {
            measured.set(id, dimensions);
            return Promise.resolve();
          },
        }),
    },
    blobs: {
      open: (blob: BlobHash) => {
        const bytes = blobs[blob];
        if (bytes === undefined) return Promise.resolve(undefined);
        return Promise.resolve(
          (async function* () {
            yield bytes;
          })(),
        );
      },
    },
  } as unknown as PoolPorts;
  return { wired, measured };
}

describe("measuring the pictures held without dimensions", () => {
  it("measures each from its bytes, and passes over one whose bytes cannot say or are gone", async () => {
    const { wired, measured } = ports(
      [
        picture("a", "blob:a"),
        picture("b", "blob:b"),
        picture("c", "blob:missing"),
      ],
      {
        "blob:a": png(640, 480),
        "blob:b": new TextEncoder().encode("not a picture"),
      },
    );

    expect(await measurePictures(wired)).toBe(1);
    expect(Object.fromEntries(measured)).toEqual({
      a: { width: 640, height: 480 },
    });
  });
});
