import { afterEach, describe, expect, it } from "vitest";

import { daemon, type Daemon } from "../testing/fixture";
import { VERSION } from "../version";

const open: Daemon[] = [];

function started(): Daemon {
  const host = daemon();
  open.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const body = (response: Response) =>
  response.json() as Promise<{ pool: string; version: string }>;

describe("GET /v1/health", () => {
  it("answers 200 with the identity of the pool it is serving", async () => {
    const host = started();

    const response = await host.app.request("/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect((await body(response)).pool).toBe(await host.pool.identity());
  });

  it("answers the same identity every time", async () => {
    const host = started();

    const first = await body(await host.app.request("/v1/health"));
    const again = await body(await host.app.request("/v1/health"));

    expect(again.pool).toBe(first.pool);
  });

  it("answers the version the daemon was built from", async () => {
    const host = started();

    const response = await host.app.request("/v1/health");

    expect((await body(response)).version).toBe(VERSION);
  });

  /** Two daemons over two pools are one build, so the version cannot be the pool's. */
  it("answers one version whatever pool it is holding", async () => {
    const one = await body(await started().app.request("/v1/health"));
    const other = await body(await started().app.request("/v1/health"));

    expect(other.version).toBe(one.version);
    expect(other.pool).not.toBe(one.pool);
  });

  it("says a different pool is a different pool", async () => {
    const one = await body(await started().app.request("/v1/health"));
    const other = await body(await started().app.request("/v1/health"));

    expect(other.pool).not.toBe(one.pool);
  });
});
