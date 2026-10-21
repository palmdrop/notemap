import type { Hono } from "hono";
import type { AppEnv } from "../types";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  daemon,
  envelope,
  ids,
  post,
  send,
  slice,
  type Daemon,
} from "../testing/fixture";

const open: Daemon[] = [];

function serving(): Hono<AppEnv> {
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

describe("a tag filter on the surfaces", () => {
  async function classified(app: Hono<AppEnv>): Promise<string[]> {
    const captured = await captureMany(app, 4);
    const [first, second, third, fourth] = captured;
    for (const id of [first, second, fourth]) {
      await send(app, `/v1/items/${id}/tag`, { tag: "project/a" });
    }
    for (const id of [second, third, fourth]) {
      await send(app, `/v1/items/${id}/tag`, { tag: "kind/quote" });
    }
    return captured;
  }

  it("reads only what carries every tag named, and carries them all on next", async () => {
    const app = serving();
    const [, second, , fourth] = await classified(app);
    const both = "tag=project%2Fa&tag=kind%2Fquote";

    const page = await slice(app, `/v1/queue?${both}&limit=1`);
    expect(ids(page)).toEqual([second]);
    expect(
      new URL(page.next ?? "", "http://pool").searchParams.getAll("tag"),
    ).toEqual(["project/a", "kind/quote"]);

    expect(ids(await slice(app, page.next ?? ""))).toEqual([fourth]);
    expect(ids(await slice(app, `/v1/feed?${both}`))).toEqual([fourth, second]);
  });

  it("carries every tag on the feed's next too", async () => {
    const app = serving();
    const [, second, , fourth] = await classified(app);

    const page = await slice(
      app,
      "/v1/feed?tag=project%2Fa&tag=kind%2Fquote&limit=1",
    );
    expect(ids(page)).toEqual([fourth]);
    expect(
      new URL(page.next ?? "", "http://pool").searchParams.getAll("tag"),
    ).toEqual(["project/a", "kind/quote"]);
    expect(ids(await slice(app, page.next ?? ""))).toEqual([second]);
  });

  it("reads the archive through it too", async () => {
    const app = serving();
    const [first, second] = await classified(app);
    await send(app, `/v1/items/${first}/archive`);
    await send(app, `/v1/items/${second}/archive`);

    expect(ids(await slice(app, "/v1/archived?tag=kind%2Fquote"))).toEqual([
      second,
    ]);
  });

  it("answers nothing for a tag nothing carries, and refuses a blank one", async () => {
    const app = serving();
    await classified(app);

    expect(await slice(app, "/v1/feed?tag=kind%2Fnothing")).toEqual({
      values: [],
    });
    for (const path of ["/v1/feed", "/v1/queue", "/v1/archived"]) {
      const response = await app.request(`${path}?tag=kind%2Fquote&tag=`);
      expect(response.status).toBe(422);
      expect(await body(response)).toEqual({
        error: { code: "tag-invalid", tag: "" },
      });
    }
  });
});

describe("the feed's state, destination and source filters", () => {
  const RELAY = "0198f0c2-0000-7000-8000-0000000000a0";

  /** Four captures: the first archived, the second marked, the third from a relay. */
  async function decided(app: Hono<AppEnv>): Promise<string[]> {
    const captured = await captureMany(app, 3);
    const [first, second] = captured;
    await send(app, `/v1/items/${first}/archive`);
    await send(app, `/v1/items/${second}/mark-processed`);
    await post(
      app,
      envelope({
        id: RELAY,
        source: "memos",
        capturedAt: "2026-08-08T09:09:00.000Z",
      }),
    );
    return [...captured, RELAY];
  }

  it("reads any one of the states named, and carries them on next", async () => {
    const app = serving();
    const [first, second, third, relayed] = await decided(app);

    const page = await slice(
      app,
      "/v1/feed?state=routed&state=archived&limit=1",
    );
    expect(ids(page)).toEqual([second]);
    expect(
      new URL(page.next ?? "", "http://pool").searchParams.getAll("state"),
    ).toEqual(["routed", "archived"]);
    expect(ids(await slice(app, page.next ?? ""))).toEqual([first]);

    expect(ids(await slice(app, "/v1/feed?state=unprocessed"))).toEqual([
      relayed,
      third,
    ]);
  });

  it("reads the source named on the feed, the queue and the archive", async () => {
    const app = serving();
    const [first, , , relayed] = await decided(app);

    expect(ids(await slice(app, "/v1/feed?source=memos"))).toEqual([relayed]);
    expect(ids(await slice(app, "/v1/queue?source=memos"))).toEqual([relayed]);
    expect(ids(await slice(app, "/v1/archived?source=memos"))).toEqual([]);

    const page = await slice(app, "/v1/archived?source=web&limit=1");
    expect(ids(page)).toEqual([first]);
  });

  it("answers nothing for a destination nothing was routed to", async () => {
    const app = serving();
    await decided(app);

    expect(await slice(app, "/v1/feed?destination=elsewhere")).toEqual({
      values: [],
    });
  });

  it("refuses a state that is not one, and an empty destination or source", async () => {
    const app = serving();
    const refused = async (query: string) => {
      const response = await app.request(`/v1/feed?${query}`);
      expect(response.status).toBe(422);
      return body(response);
    };

    expect(await refused("state=processed")).toEqual({
      error: {
        code: "bad-state",
        value: "processed",
        allowed: ["unprocessed", "routed", "archived", "revised"],
      },
    });
    expect(await refused("destination=")).toEqual({
      error: { code: "bad-destination", value: "" },
    });
    expect(await refused("source=")).toEqual({
      error: { code: "bad-source", value: "" },
    });
  });

  it("is refused on the queue and the archive, rather than ignored", async () => {
    const app = serving();

    for (const path of ["/v1/queue", "/v1/archived"]) {
      for (const parameter of ["by", "state", "destination"]) {
        const response = await app.request(`${path}?${parameter}=x`);
        expect(response.status).toBe(422);
        expect(await body(response)).toEqual({
          error: { code: "unsupported-parameter", parameter },
        });
      }
    }
  });
});

describe("the feed read by when each item was processed", () => {
  it("puts the item most recently decided about first, and carries by on next", async () => {
    const app = serving();
    const [first, second, third] = await captureMany(app, 3);
    await send(app, `/v1/items/${first}/mark-processed`);

    const page = await slice(app, "/v1/feed?by=processed&limit=2");
    expect(ids(page)).toEqual([first, third]);
    expect(new URL(page.next ?? "", "http://pool").searchParams.get("by")).toBe(
      "processed",
    );
    expect(ids(await slice(app, page.next ?? ""))).toEqual([second]);

    expect(ids(await slice(app, "/v1/feed?limit=1"))).toEqual([third]);
  });

  it("answers processedAt on every item, its capture time where nothing processed it", async () => {
    const app = serving();
    await captureMany(app, 1);

    const response = await app.request("/v1/feed");
    const { values } = (await response.json()) as {
      values: { createdAt: string; processedAt: string }[];
    };
    expect(values[0]?.processedAt).toBe(values[0]?.createdAt);
  });

  it("refuses a key that is not one", async () => {
    const app = serving();

    const response = await app.request("/v1/feed?by=modified");
    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: {
        code: "bad-by",
        by: "modified",
        allowed: ["capture", "processed"],
      },
    });
  });
});
