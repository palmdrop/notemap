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
});
