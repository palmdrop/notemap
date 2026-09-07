import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import type { AppEnv } from "../types";
import { daemon, envelope, post, WEB, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono<AppEnv> {
  const host = daemon();
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const MEMOS = "memos";

type Answer = {
  values: { id: string; items: number; lastCapturedAt: string }[];
};

async function sources(app: Hono<AppEnv>): Promise<Answer> {
  const response = await app.request("/v1/sources");
  expect(response.status).toBe(200);
  return (await response.json()) as Answer;
}

async function captured(
  app: Hono<AppEnv>,
  id: string,
  source: string,
  at: string,
): Promise<void> {
  const response = await post(app, {
    ...envelope({ id, capturedAt: at }),
    source,
    sourceItemId: id,
  });
  if (response.status !== 201) {
    throw new Error(`capture failed: ${await response.text()}`);
  }
}

describe("GET /v1/sources", () => {
  it("answers every source with its count and its last capture", async () => {
    const app = serving();
    await captured(app, "item-1", WEB, "2026-08-08T09:00:00.000Z");
    await captured(app, "item-2", WEB, "2026-08-08T11:00:00.000Z");
    await captured(app, "item-3", MEMOS, "2026-08-08T10:00:00.000Z");

    expect(await sources(app)).toEqual({
      values: [
        { id: WEB, items: 2, lastCapturedAt: "2026-08-08T11:00:00.000Z" },
        { id: MEMOS, items: 1, lastCapturedAt: "2026-08-08T10:00:00.000Z" },
      ],
    });
  });

  /** Discovered rather than declared: a pool with no items has seen no source. */
  it("answers an empty list for a pool holding nothing", async () => {
    expect(await sources(serving())).toEqual({ values: [] });
  });
});
