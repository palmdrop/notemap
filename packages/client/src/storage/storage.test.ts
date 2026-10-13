import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { Storage } from "#api/types";
import { createClient } from "../client";
import { Unreachable } from "../errors";
import { json, mockTransport, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const client = createClient({ transport, store: createMemoryStore() });
  return { client, transport };
}

const REPORT: Storage = {
  pool: {
    path: "/var/lib/notemap/state/notemap.db",
    bytes: 4_296_704,
    unused: 65_536,
    free: 52_123_456_789,
  },
  assets: {
    path: "/var/lib/notemap/assets",
    count: 142,
    bytes: 88_214_016,
    saved: 18_874_368,
    free: 52_123_456_789,
  },
  mirror: { path: "/var/lib/notemap/pool-mirror", free: 52_123_456_789 },
  auth: { path: "/var/lib/notemap/state/auth.db", bytes: 32_768 },
  deployment: { name: "docker", contained: true },
};

const MEASURED: Storage = {
  ...REPORT,
  measured: {
    at: "2026-10-12T09:14:02.000Z",
    blobs: { count: 140, bytes: 87_500_000 },
    reclaimable: { count: 2, bytes: 714_016 },
    withinGrace: { count: 1, bytes: 1_024 },
    mirror: { records: 1_204, files: 2_408, bytes: 3_512_000 },
  },
};

describe("what the pool takes on disk", () => {
  it("answers what the daemon said, whole", async () => {
    const { client } = clientOver(() => json(200, REPORT));

    await expect(client.storage.read()).resolves.toEqual(REPORT);
  });

  it("asks for a measurement and answers the reading with it in", async () => {
    const asked: { method: string; path: string }[] = [];
    const { client } = clientOver((request) => {
      asked.push({
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return json(200, MEASURED);
    });

    await expect(client.storage.measure()).resolves.toEqual(MEASURED);
    expect(asked).toEqual([{ method: "POST", path: "/v1/storage/measure" }]);
  });

  it("fires the reclaim and answers what it took", async () => {
    const { client } = clientOver(() =>
      json(200, { blobs: 2, bytes: 714_016 }),
    );

    await expect(client.storage.reclaim()).resolves.toEqual({
      blobs: 2,
      bytes: 714_016,
    });
  });

  /** Nothing is held, so there is no older answer to hand back instead. */
  it("fails rather than answering an older reading when the pool is out of reach", async () => {
    const { client, transport } = clientOver(() => json(200, MEASURED));
    await client.storage.read();

    transport.unreachable(true);

    await expect(client.storage.read()).rejects.toBeInstanceOf(Unreachable);
    await expect(client.storage.measure()).rejects.toBeInstanceOf(Unreachable);
    await expect(client.storage.reclaim()).rejects.toBeInstanceOf(Unreachable);
  });
});
