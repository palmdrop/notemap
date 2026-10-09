import { describe, expect, it } from "vitest";

import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { Asset, Dimensions } from "#types/domain/asset";
import type { AssetId, BlobHash, Timestamp } from "#types/domain/ids";
import { png } from "#testing/pictures";

import { measurePictures, reclaimUnnamedBlobs } from "./maintenance";

function picture(id: string, blob = `blob:${id}`): Asset {
  return {
    id: id as AssetId,
    filename: `${id}.png`,
    mime: "image/png",
    blob: blob as BlobHash,
    bytes: 33,
  };
}

/** A blob is bytes, a read that fails, or nothing at all. */
type Held = Uint8Array | Error;

function ports(
  held: readonly Asset[],
  blobs: (blob: BlobHash, signal?: AbortSignal) => Held | undefined,
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
      open: (blob: BlobHash, signal?: AbortSignal) => {
        const bytes = blobs(blob, signal);
        if (bytes === undefined) return Promise.resolve(undefined);
        return Promise.resolve(
          (async function* () {
            if (bytes instanceof Error) throw bytes;
            yield bytes;
          })(),
        );
      },
    },
  } as unknown as PoolPorts;
  return { wired, measured };
}

describe("measuring the pictures held without dimensions", () => {
  it("measures each from its bytes, and passes over one whose bytes cannot say, are gone or cannot be read", async () => {
    const { wired, measured } = ports(
      [picture("a"), picture("b"), picture("c"), picture("d"), picture("e")],
      (blob) =>
        (
          ({
            "blob:a": png(640, 480),
            "blob:b": new TextEncoder().encode("not a picture"),
            "blob:d": new Error("EIO"),
            "blob:e": png(10, 20),
          }) as Record<string, Held>
        )[blob],
    );

    expect(await measurePictures(wired)).toBe(2);
    expect(Object.fromEntries(measured)).toEqual({
      a: { width: 640, height: 480 },
      e: { width: 10, height: 20 },
    });
  });

  it("goes on past a full page of pictures it could not measure", async () => {
    const unmeasurable = Array.from({ length: 500 }, (_, at) =>
      picture(`a${String(at).padStart(3, "0")}`),
    );
    const { wired, measured } = ports(
      [...unmeasurable, picture("b")],
      (blob) => (blob === "blob:b" ? png(1, 1) : undefined),
    );

    expect(await measurePictures(wired)).toBe(1);
    expect([...measured.keys()]).toEqual(["b"]);
  });

  it("stops where it stands when told to, as a stop rather than a failure", async () => {
    const stopping = new AbortController();
    const { wired } = ports([picture("a"), picture("b")], (_, signal) => {
      stopping.abort();
      return signal?.reason instanceof Error
        ? signal.reason
        : new Error("aborted");
    });

    await expect(measurePictures(wired, stopping.signal)).resolves.toBe(0);
  });
});

const NOW = "2026-10-09T12:00:00.000Z" as Timestamp;
const DAY = 86_400_000;
const config = { sweep: { grace: DAY } } as unknown as PoolConfig;

function ago(ms: number): Timestamp {
  return new Date(Date.parse(NOW) - ms).toISOString() as Timestamp;
}

/** `named` is read at the moment the transaction asks, so a test can name a blob mid-walk. */
function reclaiming(
  held: Record<string, Timestamp>,
  named: Set<string>,
  onList?: (hash: string) => void,
) {
  const kept = new Map(Object.entries(held));
  let locked = false;
  const wired = {
    clock: { now: () => NOW },
    store: {
      transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
        if (locked) throw new Error("transactions overlapped");
        locked = true;
        try {
          return await work({
            blobNamed: (blob: BlobHash) => Promise.resolve(named.has(blob)),
          });
        } finally {
          locked = false;
        }
      },
    },
    blobs: {
      list: async function* () {
        for (const [hash, at] of [...kept]) {
          onList?.(hash);
          yield { hash: hash as BlobHash, at };
        }
      },
      delete: (blob: BlobHash) => {
        if (!locked) throw new Error("deleted outside a transaction");
        kept.delete(blob);
        return Promise.resolve();
      },
    },
  } as unknown as PoolPorts;
  return { wired, kept };
}

describe("reclaiming blobs nothing names", () => {
  it("takes an unnamed blob past the grace window, and keeps one within it", async () => {
    const { wired, kept } = reclaiming(
      { old: ago(DAY + 1), fresh: ago(DAY - 1) },
      new Set(),
    );

    expect(await reclaimUnnamedBlobs(config, wired)).toBe(1);
    expect([...kept.keys()]).toEqual(["fresh"]);
  });

  it("keeps an old blob something names", async () => {
    const { wired, kept } = reclaiming({ old: ago(2 * DAY) }, new Set(["old"]));

    expect(await reclaimUnnamedBlobs(config, wired)).toBe(0);
    expect([...kept.keys()]).toEqual(["old"]);
  });

  it("asks again under the lock, so a blob named after it was listed is kept", async () => {
    const named = new Set<string>();
    const { wired, kept } = reclaiming({ old: ago(2 * DAY) }, named, (hash) =>
      named.add(hash),
    );

    expect(await reclaimUnnamedBlobs(config, wired)).toBe(0);
    expect([...kept.keys()]).toEqual(["old"]);
  });

  it("stops where it stands when told to", async () => {
    const stopping = new AbortController();
    const { wired, kept } = reclaiming(
      { a: ago(2 * DAY), b: ago(2 * DAY) },
      new Set(),
      () => stopping.abort(),
    );

    expect(await reclaimUnnamedBlobs(config, wired, stopping.signal)).toBe(0);
    expect(kept.size).toBe(2);
  });
});
