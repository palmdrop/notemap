import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import type { AppEnv } from "../types";
import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono<AppEnv> {
  const host = daemon();
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function counts(app: Hono<AppEnv>): Promise<unknown> {
  const response = await app.request("/v1/counts");
  expect(response.status).toBe(200);
  return response.json();
}

describe("GET /v1/counts", () => {
  it("answers nothing queued for an empty pool", async () => {
    expect(await counts(serving())).toEqual({ queue: 0 });
  });

  it("counts what the queue holds, as items leave it", async () => {
    const app = serving();
    const [first, second] = await captureMany(app, 3);

    expect(await counts(app)).toEqual({ queue: 3 });

    await send(app, `/v1/items/${first}/archive`);
    await send(app, `/v1/items/${second}/mark-processed`);

    expect(await counts(app)).toEqual({ queue: 1 });
  });

  it("counts what was captured since a time, and refuses one that is not a time", async () => {
    const app = serving();
    await captureMany(app, 2);

    const since = await app.request(
      `/v1/counts?since=${encodeURIComponent("2000-01-01T00:00:00.000Z")}`,
    );
    expect(await since.json()).toEqual({ queue: 2, captured: 2 });

    const later = await app.request(
      `/v1/counts?since=${encodeURIComponent("2999-01-01T00:00:00.000Z")}`,
    );
    expect(await later.json()).toEqual({ queue: 2, captured: 0 });

    const bad = await app.request("/v1/counts?since=yesterday");
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: { code: "bad-since" } });
  });
});
