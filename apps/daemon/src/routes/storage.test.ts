import { mkdtempSync, rmSync } from "node:fs";
import { utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import { systemClock } from "../ports";
import type { StorageReport } from "../storage";
import {
  daemon,
  envelope,
  post,
  put,
  send,
  type Daemon,
} from "../testing/fixture";
import { CHEAP_HASHING } from "../testing/hashing";
import type { AppEnv } from "../types";

const open: Daemon[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

function serving(options: Parameters<typeof daemon>[1] = {}): Daemon {
  const host = daemon(undefined, options);
  open.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

async function read(app: Hono<AppEnv>): Promise<StorageReport> {
  const response = await app.request("/v1/storage");
  expect(response.status).toBe(200);
  return (await response.json()) as StorageReport;
}

const PICTURE = {
  "content-type": "image/png",
  "content-disposition": 'attachment; filename="photo.png"',
};

/** A blob nothing names, old enough for a reclaim to have it. */
async function orphan(host: Daemon): Promise<number> {
  const stored = await host.blobs.put(
    (async function* () {
      yield new TextEncoder().encode("bytes no asset ever named");
    })(),
  );
  const long = new Date("2020-01-01T00:00:00Z");
  await utimes(host.blobs.pathFor(stored.hash), long, long);
  return stored.bytes;
}

describe("GET /v1/storage", () => {
  it("answers where things are and what they take, with no measurement", async () => {
    const host = serving({ mirroring: true });
    expect((await put(host.app, "a picture", PICTURE)).status).toBe(201);

    const report = await read(host.app);

    expect(report.pool.path).toContain("pool.db");
    expect(report.pool.bytes).toBeGreaterThan(0);
    expect(report.assets).toMatchObject({ path: host.assetRoot, count: 1 });
    expect(report.assets.bytes).toBe("a picture".length);
    expect(report.mirror?.path).toBe(host.mirrorRoot);
    expect(report.assets.free).toBeGreaterThan(0);
    expect(report.measured).toBeUndefined();
  });

  it("says nothing about a mirror on a daemon with none, and claims no deployment", async () => {
    const report = await read(serving().app);

    expect(report.mirror).toBeUndefined();
    expect(report.deployment).toBeUndefined();
  });

  /** The whole reason the two halves are split: this is read on sight. */
  it("walks nothing", async () => {
    const host = serving({ mirroring: true });
    expect((await put(host.app, "a picture", PICTURE)).status).toBe(201);
    host.blobs.list = () => {
      throw new Error("a read of /v1/storage must never list the blob store");
    };

    expect((await read(host.app)).assets.count).toBe(1);
  });

  it("says what the daemon was told it is deployed as, and whether that contains it", async () => {
    const report = await read(
      serving({ deployment: { name: "docker", contained: true } }).app,
    );

    expect(report.deployment).toEqual({ name: "docker", contained: true });
  });
});

describe("POST /v1/storage/measure", () => {
  it("fills the measurement, which the next read answers", async () => {
    const host = serving({ mirroring: true });
    expect((await put(host.app, "a picture", PICTURE)).status).toBe(201);
    const bytes = await orphan(host);

    const measured = (await send(host.app, "/v1/storage/measure").then(
      (response) => response.json(),
    )) as StorageReport;

    expect(measured.measured).toMatchObject({
      blobs: { count: 2 },
      reclaimable: { count: 1, bytes },
      withinGrace: { count: 0, bytes: 0 },
    });
    expect((await read(host.app)).measured).toEqual(measured.measured);
  });

  it("answers the mirror's own figures once something has been written", async () => {
    const host = serving({ mirroring: true });
    await post(host.app, envelope());
    await host.drain();

    const measured = (await send(host.app, "/v1/storage/measure").then(
      (response) => response.json(),
    )) as StorageReport;

    expect(measured.measured?.mirror).toMatchObject({ records: 1, files: 2 });
  });
});

describe("POST /v1/reclaim", () => {
  it("takes exactly what the measurement said it would, and leaves the figure stale", async () => {
    const host = serving();
    expect((await put(host.app, "a picture", PICTURE)).status).toBe(201);
    const bytes = await orphan(host);

    const measured = (await send(host.app, "/v1/storage/measure").then(
      (response) => response.json(),
    )) as StorageReport;
    const took = (await send(host.app, "/v1/reclaim").then((response) =>
      response.json(),
    )) as { blobs: number; bytes: number };

    expect(took).toEqual({ blobs: 1, bytes });
    expect(took.bytes).toBe(measured.measured?.reclaimable.bytes);

    // Nothing re-walks on its own: the figure describes the moment before.
    expect((await read(host.app)).measured?.reclaimable).toEqual({
      count: 1,
      bytes,
    });
    const again = (await send(host.app, "/v1/storage/measure").then(
      (response) => response.json(),
    )) as StorageReport;
    expect(again.measured?.reclaimable).toEqual({ count: 0, bytes: 0 });
  });

  it("answers zeroes where there is nothing to take", async () => {
    const host = serving();

    const took = await send(host.app, "/v1/reclaim");

    expect(await took.json()).toEqual({ blobs: 0, bytes: 0 });
  });
});

describe("the door", () => {
  it("lets a token through to all three, and nobody without one", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notemap-route-storage-"));
    const store = createSqliteAuthStore({
      file: join(directory, "auth.db"),
      synchronous: "off",
    });
    stores.push({ store, directory });
    const auth = createAuth(store, {
      clock: systemClock,
      hashing: CHEAP_HASHING,
    });
    await auth.setPassword("anton", "correct horse battery staple");
    const minted = await auth.mintToken("laptop");
    const host = serving({ auth });
    const bearer = { authorization: `Bearer ${minted.token}` };

    for (const [path, method] of [
      ["/v1/storage", "GET"],
      ["/v1/storage/measure", "POST"],
      ["/v1/reclaim", "POST"],
    ] as const) {
      const headers = { "content-type": "application/json" };
      expect((await host.app.request(path, { method, headers })).status).toBe(
        401,
      );
      expect(
        (
          await host.app.request(path, {
            method,
            headers: { ...headers, ...bearer },
          })
        ).status,
      ).toBe(200);
    }
  });
});
