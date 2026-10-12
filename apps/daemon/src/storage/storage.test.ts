import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Clock,
  MeasuredStorage,
  Pool,
  RecordedStorage,
  ReclaimOutcome,
  Timestamp,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createStorage, type StorageConfig } from "./storage";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-storage-"));
  directories.push(directory);
  return directory;
}

const RECORDED: RecordedStorage = {
  store: { bytes: 4096, unused: 0 },
  assets: { count: 2, bytes: 300 },
};

const MEASURED: MeasuredStorage = {
  blobs: { count: 1, bytes: 200 },
  reclaimable: { count: 1, bytes: 200 },
  withinGrace: { count: 0, bytes: 0 },
};

const clock: Clock = { now: () => "2026-10-12T09:00:00.000Z" as Timestamp };

/** A pool that answers what it is told to, and counts how often it was asked. */
function stubPool(
  measured: () => Promise<MeasuredStorage> = () => Promise.resolve(MEASURED),
) {
  let walks = 0;
  let recordings = 0;

  const pool = {
    storage: {
      recorded: () => {
        recordings += 1;
        return Promise.resolve(RECORDED);
      },
      measure: () => {
        walks += 1;
        return measured();
      },
    },
  } as unknown as Pool;

  return { pool, walks: () => walks, recordings: () => recordings };
}

function wired(
  overrides: Partial<StorageConfig> = {},
  pool: Pool = stubPool().pool,
  reclaim: () => Promise<ReclaimOutcome> = () =>
    Promise.resolve({ blobs: 0, bytes: 0 }),
) {
  const directory = scratch();
  return createStorage(
    pool,
    {
      pool: join(directory, "state", "notemap.db"),
      assets: join(directory, "assets"),
      clock,
      ...overrides,
    },
    reclaim,
  );
}

describe("reading what notemap takes", () => {
  it("answers the pool and the assets with the space free where each lives", async () => {
    const report = await wired().read();

    expect(report.pool).toMatchObject({ bytes: 4096, unused: 0 });
    expect(report.assets).toMatchObject({ count: 2, bytes: 300 });
    expect(report.pool.free).toBeGreaterThan(0);
    expect(report.assets.free).toBeGreaterThan(0);
  });

  /** The whole point of splitting the two: a surface may ask on sight. */
  it("walks nothing", async () => {
    const stub = stubPool(() =>
      Promise.reject(new Error("a read must never walk")),
    );

    await expect(wired({}, stub.pool).read()).resolves.toBeDefined();
    expect(stub.walks()).toBe(0);
  });

  it("says nothing about a mirror where none is configured", async () => {
    expect((await wired().read()).mirror).toBeUndefined();
  });

  it("answers a mirror root that does not exist yet, through its nearest parent", async () => {
    const directory = scratch();
    const report = await wired({
      pool: join(directory, "state", "notemap.db"),
      mirror: join(directory, "pool-mirror"),
    }).read();

    expect(report.mirror?.path).toContain("pool-mirror");
    expect(report.mirror?.free).toBeGreaterThan(0);
  });

  it("answers the daemon's own database where it has one, and nothing where it has none", async () => {
    const directory = scratch();
    const file = join(directory, "auth.db");
    writeFileSync(file, "x".repeat(64));

    expect((await wired({ auth: file }).read()).auth).toEqual({
      path: file,
      bytes: 64,
    });
    expect(
      (await wired({ auth: join(directory, "never-written.db") }).read()).auth,
    ).toBeUndefined();
  });

  it("claims a deployment only where it was told one", async () => {
    expect((await wired().read()).deployment).toBeUndefined();
    expect((await wired({ deployment: "docker" }).read()).deployment).toBe(
      "docker",
    );
  });

  it("holds no measurement until one is taken", async () => {
    expect((await wired().read()).measured).toBeUndefined();
  });
});

describe("measuring", () => {
  it("fills the measurement, and says when it was taken", async () => {
    const storage = wired();

    expect((await storage.measure()).measured).toEqual({
      ...MEASURED,
      at: clock.now(),
    });
    expect((await storage.read()).measured).toEqual({
      ...MEASURED,
      at: clock.now(),
    });
  });

  it("joins one already in flight rather than starting another", async () => {
    let release: ((storage: MeasuredStorage) => void) | undefined;
    const stub = stubPool(
      () =>
        new Promise<MeasuredStorage>((resolve) => {
          release = resolve;
        }),
    );
    const storage = wired({}, stub.pool);

    const first = storage.measure();
    const second = storage.measure();
    release?.(MEASURED);

    expect((await first).measured).toEqual({ ...MEASURED, at: clock.now() });
    expect((await second).measured).toEqual({ ...MEASURED, at: clock.now() });
    expect(stub.walks()).toBe(1);
  });

  it("measures again once the first has answered", async () => {
    const stub = stubPool();
    const storage = wired({}, stub.pool);

    await storage.measure();
    await storage.measure();

    expect(stub.walks()).toBe(2);
  });
});

describe("the reclaim", () => {
  it("is the one it was handed, so a person fires the daemon's own", async () => {
    let fired = 0;
    const storage = wired({}, stubPool().pool, () => {
      fired += 1;
      return Promise.resolve({ blobs: 2, bytes: 500 });
    });

    expect(await storage.reclaim()).toEqual({ blobs: 2, bytes: 500 });
    expect(fired).toBe(1);
  });

  /** It changes what a walk would find, and nothing re-walks on its own. */
  it("leaves the remembered measurement where it was", async () => {
    const storage = wired({}, stubPool().pool, () =>
      Promise.resolve({ blobs: 1, bytes: 200 }),
    );
    await storage.measure();

    await storage.reclaim();

    expect((await storage.read()).measured).toMatchObject({
      reclaimable: { count: 1, bytes: 200 },
    });
  });
});
