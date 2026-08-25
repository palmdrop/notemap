import { describe, expect, it } from "vitest";

import { daemons } from "./harness/index.ts";

const daemon = daemons();

/**
 * Read over `fetch` rather than through the client: nothing on the client asks
 * for this yet, and the route is the thing under test.
 */
async function poolOf(url: string): Promise<string> {
  const response = await fetch(`${url}/v1/health`);

  expect(response.status).toBe(200);
  return ((await response.json()) as { pool: string }).pool;
}

describe("the pool a daemon says it is serving", () => {
  it("is the one it left behind when it started again", async () => {
    const first = await daemon();
    const held = await poolOf(first.url);
    expect(await first.stop()).toBe(0);

    const again = await daemon(first.world);

    expect(await poolOf(again.url)).toBe(held);
  });

  /** One port at a time, so the second pool is served after the first has gone. */
  it("is a different pool from the one another daemon holds", async () => {
    const first = await daemon();
    const held = await poolOf(first.url);
    expect(await first.stop()).toBe(0);

    const elsewhere = await daemon();

    expect(await poolOf(elsewhere.url)).not.toBe(held);
  });
});
