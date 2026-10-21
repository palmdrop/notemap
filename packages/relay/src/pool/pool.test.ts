import { describe, expect, it } from "vitest";

import { notThisItem, poolAt, PoolRefused, PoolUnreachable } from "./pool";

function reaching(send: typeof globalThis.fetch) {
  return poolAt({ url: "http://pool.test/", token: "t", fetch: send });
}

describe("a pool that never answered", () => {
  it("is unreachable rather than refused", async () => {
    const failure = new TypeError("fetch failed");
    const pool = reaching(() => Promise.reject(failure));

    const thrown: unknown = await pool
      .asset("a-1")
      .catch((cause: unknown) => cause);

    expect(thrown).toBeInstanceOf(PoolUnreachable);
    expect((thrown as PoolUnreachable).route).toBe("/v1/assets/a-1");
    // The chain is kept, so a log can say what `fetch` could not do.
    expect((thrown as PoolUnreachable).cause).toBe(failure);
  });

  it("leaves an abort as the abort it was", async () => {
    const stopped = new DOMException("aborted", "AbortError");
    const pool = reaching(() => Promise.reject(stopped));

    await expect(pool.asset("a-1")).rejects.toBe(stopped);
  });
});

describe("whether a failure was the item's", () => {
  const refusal = (status: number) =>
    new PoolRefused(status, "whatever", "/v1/captures");

  it("is not, where the pool was never reached or would refuse anything", () => {
    expect(notThisItem(new PoolUnreachable("/v1/captures", undefined))).toBe(
      true,
    );
    expect(notThisItem(refusal(401))).toBe(true);
    expect(notThisItem(refusal(403))).toBe(true);
    expect(notThisItem(refusal(503))).toBe(true);
  });

  it("is, where the pool answered about this payload", () => {
    expect(notThisItem(refusal(422))).toBe(false);
    expect(notThisItem(refusal(409))).toBe(false);
    expect(notThisItem(new Error("a mapping bug"))).toBe(false);
  });
});

describe("a capture the pool holds under that identity already", () => {
  const answering = (code: string) =>
    reaching(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code, existing: "head" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  const envelope = {
    source: "s",
    sourceItemId: "u-1",
    capturedAt: "2026-09-04T14:23:05.000Z",
    payload: {},
    tags: [],
  };

  it("names the head an upstream edit goes to", async () => {
    expect(await answering("source-item-changed").capture(envelope)).toEqual({
      kind: "changed",
      existing: "head",
    });
  });

  it("names the head a divergence continues", async () => {
    expect(await answering("source-item-diverged").capture(envelope)).toEqual({
      kind: "diverged",
      existing: "head",
    });
  });

  it("throws anything else it was refused", async () => {
    await expect(
      answering("continues-not-head").capture(envelope),
    ).rejects.toBeInstanceOf(PoolRefused);
  });
});
