import { describe, expect, it } from "vitest";

import type { PoolConfig } from "../types/api/config";
import type { PoolPorts, PoolStore } from "../types/api/ports";
import type { PoolIdentity } from "../types/domain/ids";

import { createPool } from "./pool";

const CONFIG = {
  sources: [],
  payloadTypes: [],
  enrichments: [],
} as unknown as PoolConfig;

describe("which pool this is", () => {
  it("is answered off the store, so a host never reaches past the pool for it", async () => {
    const store = {
      identity: async () => "pool-1" as PoolIdentity,
    } as unknown as PoolStore;

    const pool = createPool(CONFIG, { store } as unknown as PoolPorts);

    expect(await pool.identity()).toBe("pool-1");
  });
});
