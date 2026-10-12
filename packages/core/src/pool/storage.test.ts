import { describe, expect, it } from "vitest";

import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { BlobHash, Timestamp } from "#types/domain/ids";
import type { MirrorFootprint } from "#types/domain/storage";

import { reclaimUnnamedBlobs } from "./maintenance";
import { measure, recorded } from "./storage";

const NOW = "2026-10-12T12:00:00.000Z" as Timestamp;
const DAY = 86_400_000;
const config = { sweep: { grace: DAY } } as unknown as PoolConfig;

function ago(ms: number): Timestamp {
  return new Date(Date.parse(NOW) - ms).toISOString() as Timestamp;
}

type Blob = { readonly bytes: number; readonly at: Timestamp };

type Wiring = {
  /** By hash. */
  readonly blobs?: Record<string, Blob>;
  readonly named?: readonly string[];
  readonly store?: { bytes: number; unused: number };
  readonly assets?: { count: number; bytes: number };
  readonly mirror?: MirrorFootprint;
  readonly onList?: (hash: string) => void;
};

function ports(wiring: Wiring = {}) {
  const kept = new Map(Object.entries(wiring.blobs ?? {}));
  const named = new Set(wiring.named ?? []);
  let listed = 0;

  const wired = {
    clock: { now: () => NOW },
    store: {
      footprint: () => Promise.resolve(wiring.store ?? { bytes: 0, unused: 0 }),
      assetsHeld: () =>
        Promise.resolve(wiring.assets ?? { count: 0, bytes: 0 }),
      blobNamed: (blob: BlobHash) => Promise.resolve(named.has(blob)),
      transaction: <T>(work: (tx: unknown) => Promise<T>) =>
        work({
          blobNamed: (blob: BlobHash) => Promise.resolve(named.has(blob)),
        }),
    },
    blobs: {
      list: async function* () {
        for (const [hash, blob] of [...kept]) {
          listed += 1;
          wiring.onList?.(hash);
          yield { hash: hash as BlobHash, ...blob };
        }
      },
      lastPut: (blob: BlobHash) => Promise.resolve(kept.get(blob)?.at),
      delete: (blob: BlobHash) => {
        kept.delete(blob);
        return Promise.resolve();
      },
    },
    ...(wiring.mirror === undefined
      ? {}
      : { mirrorWriter: { footprint: () => Promise.resolve(wiring.mirror) } }),
  } as unknown as PoolPorts;

  return { wired, kept, listed: () => listed };
}

describe("what the pool has written down", () => {
  it("answers zeroes rather than absence for a pool holding nothing", async () => {
    const { wired } = ports();

    expect(await recorded(wired)).toEqual({
      store: { bytes: 0, unused: 0 },
      assets: { count: 0, bytes: 0 },
    });
  });

  it("walks nothing", async () => {
    const { wired, listed } = ports({
      blobs: { a: { bytes: 10, at: NOW } },
      store: { bytes: 4096, unused: 0 },
      assets: { count: 1, bytes: 10 },
    });

    await recorded(wired);

    expect(listed()).toBe(0);
  });

  /**
   * Two assets over one blob are summed twice here and counted once by the
   * walk, and the difference is what content addressing saved.
   */
  it("sums the assets as the registry holds them", async () => {
    const { wired } = ports({
      blobs: { shared: { bytes: 100, at: NOW } },
      named: ["shared"],
      assets: { count: 2, bytes: 200 },
    });

    expect((await recorded(wired)).assets).toEqual({ count: 2, bytes: 200 });
    expect((await measure(config, wired)).blobs).toEqual({
      count: 1,
      bytes: 100,
    });
  });
});

describe("measuring what the blob store holds", () => {
  it("counts every blob, and splits what nothing names by the grace window", async () => {
    const { wired } = ports({
      blobs: {
        named: { bytes: 1000, at: ago(2 * DAY) },
        orphan: { bytes: 300, at: ago(2 * DAY) },
        justPut: { bytes: 7, at: ago(DAY - 1) },
      },
      named: ["named"],
    });

    expect(await measure(config, wired)).toEqual({
      blobs: { count: 3, bytes: 1307 },
      reclaimable: { count: 1, bytes: 300 },
      withinGrace: { count: 1, bytes: 7 },
    });
  });

  it("answers zeroes for a store holding nothing", async () => {
    const { wired } = ports();

    expect(await measure(config, wired)).toEqual({
      blobs: { count: 0, bytes: 0 },
      reclaimable: { count: 0, bytes: 0 },
      withinGrace: { count: 0, bytes: 0 },
    });
  });

  it("answers the mirror's own figures where one is wired, and none where it is not", async () => {
    const mirror = { records: 2, files: 4, bytes: 900 };
    const { wired } = ports({ mirror });

    expect((await measure(config, wired)).mirror).toEqual(mirror);
    expect((await measure(config, ports().wired)).mirror).toBeUndefined();
  });

  it("deletes nothing", async () => {
    const { wired, kept } = ports({
      blobs: { orphan: { bytes: 300, at: ago(2 * DAY) } },
    });

    await measure(config, wired);

    expect([...kept.keys()]).toEqual(["orphan"]);
  });

  it("throws where its signal fires rather than answering half a figure", async () => {
    const stopping = new AbortController();
    const { wired, kept } = ports({
      blobs: {
        a: { bytes: 10, at: ago(2 * DAY) },
        b: { bytes: 10, at: ago(2 * DAY) },
      },
      onList: () => stopping.abort(),
    });

    await expect(measure(config, wired, stopping.signal)).rejects.toThrow();
    expect(kept.size).toBe(2);
  });
});

describe("the figure a person is shown and the reclaim they fire", () => {
  /** Decision 4: one grace predicate, so these two cannot drift apart. */
  it("take exactly the same blobs", async () => {
    const { wired, kept } = ports({
      blobs: {
        named: { bytes: 1000, at: ago(2 * DAY) },
        orphan: { bytes: 300, at: ago(2 * DAY) },
        alsoOrphan: { bytes: 44, at: ago(DAY + 1) },
        justPut: { bytes: 7, at: ago(DAY - 1) },
      },
      named: ["named"],
    });

    const measured = await measure(config, wired);
    const took = await reclaimUnnamedBlobs(config, wired);

    expect(took).toEqual({
      blobs: measured.reclaimable.count,
      bytes: measured.reclaimable.bytes,
    });
    expect([...kept.keys()].sort()).toEqual(["justPut", "named"]);
  });

  it("leaves a blob inside the window, which is the other figure", async () => {
    const { wired, kept } = ports({
      blobs: { justPut: { bytes: 7, at: ago(DAY - 1) } },
    });

    expect((await measure(config, wired)).withinGrace).toEqual({
      count: 1,
      bytes: 7,
    });
    expect(await reclaimUnnamedBlobs(config, wired)).toEqual({
      blobs: 0,
      bytes: 0,
    });
    expect([...kept.keys()]).toEqual(["justPut"]);
  });

  /** An output a routing record names keeps its blob, so it is in neither figure. */
  it("leaves a blob a routing record's output names out of both", async () => {
    const { wired } = ports({
      blobs: { output: { bytes: 90, at: ago(2 * DAY) } },
      named: ["output"],
    });

    const measured = await measure(config, wired);

    expect(measured.reclaimable).toEqual({ count: 0, bytes: 0 });
    expect(measured.withinGrace).toEqual({ count: 0, bytes: 0 });
    expect(measured.blobs).toEqual({ count: 1, bytes: 90 });
  });
});
