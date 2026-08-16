import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  daemon,
  ids,
  send,
  slice,
  type Daemon,
} from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono {
  const host = daemon();
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const body = (response: Response) => response.json() as Promise<never>;

/** The `after` a surface handed back, ready to give to another one. */
function positionIn(next: string | undefined): string {
  if (next === undefined) throw new Error("expected another page");
  const after = new URL(next, "http://pool").searchParams.get("after");
  if (after === null) throw new Error(`no position in ${next}`);
  return after;
}

describe("GET /v1/queue", () => {
  it("answers every unprocessed item, oldest first", async () => {
    const app = serving();
    const captured = await captureMany(app, 3);

    expect(ids(await slice(app, "/v1/queue"))).toEqual(captured);
  });

  it("drains to empty as items are archived and marked processed", async () => {
    const app = serving();
    const [first, second, third] = await captureMany(app, 3);

    expect((await send(app, `/v1/items/${first}/archive`)).status).toBe(200);
    expect((await send(app, `/v1/items/${second}/mark-processed`)).status).toBe(
      200,
    );

    expect(ids(await slice(app, "/v1/queue"))).toEqual([third]);

    await send(app, `/v1/items/${third}/mark-processed`);

    expect(await slice(app, "/v1/queue")).toEqual({ values: [] });
  });

  it("yields every item exactly once through next, with no trailing empty page", async () => {
    const app = serving();
    const captured = await captureMany(app, 5);

    const seen: string[] = [];
    let url: string | undefined = "/v1/queue?limit=2";
    let pages = 0;
    while (url !== undefined) {
      const page = await slice(app, url);
      seen.push(...ids(page));
      url = page.next;
      pages += 1;
    }

    expect(seen).toEqual(captured);
    expect(pages).toBe(3);
  });

  it("refuses a bad limit and a bad position the way the feed does", async () => {
    const app = serving();

    expect((await app.request("/v1/queue?limit=501")).status).toBe(422);
    expect(await body(await app.request("/v1/queue?after=yesterday"))).toEqual({
      error: { code: "bad-position", after: "yesterday" },
    });
  });

  it("reads the other way when asked", async () => {
    const app = serving();
    const captured = await captureMany(app, 3);

    expect(ids(await slice(app, "/v1/queue?order=newest-first"))).toEqual(
      [...captured].reverse(),
    );
  });

  it("refuses an order that is neither", async () => {
    const app = serving();

    const response = await app.request("/v1/queue?order=sideways");

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "bad-order",
        order: "sideways",
        allowed: ["newest-first", "oldest-first"],
      },
    });
  });

  it("carries the order it was read in on the next page", async () => {
    const app = serving();
    await captureMany(app, 3);

    const response = await app.request("/v1/queue?order=newest-first&limit=2");
    const body = (await response.json()) as { next?: string };

    expect(body.next).toContain("order=newest-first");
  });

  it("accepts a feed position and answers a page from the wrong place", async () => {
    const app = serving();
    const captured = await captureMany(app, 5);

    // A feed read from the newest end stops at the third-newest item; the queue
    // reads that same instant as a content time and continues *upwards* from
    // it. Nothing in either wire form can tell the two apart.
    const feed = await slice(app, "/v1/feed?limit=2");
    const wrong = await slice(
      app,
      `/v1/queue?after=${encodeURIComponent(positionIn(feed.next))}`,
    );

    expect(ids(wrong)).toEqual([captured[4]]);
    expect(ids(await slice(app, "/v1/queue?limit=2"))).toEqual([
      captured[0],
      captured[1],
    ]);
  });
});

describe("GET /v1/archived", () => {
  it("answers what has been archived, and nothing else", async () => {
    const app = serving();
    const [first, second] = await captureMany(app, 3);

    await send(app, `/v1/items/${second}/archive`, { reason: "noise" });

    expect(ids(await slice(app, "/v1/archived"))).toEqual([second]);
    expect(ids(await slice(app, "/v1/queue"))).not.toContain(second);
    expect(ids(await slice(app, "/v1/queue"))).toContain(first);
  });

  it("empties as items are unarchived", async () => {
    const app = serving();
    const [first] = await captureMany(app, 2);

    await send(app, `/v1/items/${first}/archive`);
    expect((await send(app, `/v1/items/${first}/unarchive`)).status).toBe(200);

    expect(await slice(app, "/v1/archived")).toEqual({ values: [] });
  });
});
