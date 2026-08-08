import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  CONFIG,
  daemon,
  envelope,
  post,
  TEXT,
  WEB,
  type Daemon,
} from "./testing/fixture";

const open: Daemon[] = [];

function serving(...args: Parameters<typeof daemon>) {
  const started = daemon(...args);
  open.push(started);
  return started.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const body = (response: Response) => response.json() as Promise<never>;

describe("POST /v1/captures", () => {
  it("answers 201 with the outcome, and names the item in Location", async () => {
    const app = serving();

    const response = await post(app, envelope({ id: "item-1" }));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("location")).toBe("/v1/items/item-1");
    expect(await body(response)).toMatchObject({
      kind: "captured",
      item: { id: "item-1", source: WEB, payload: { type: TEXT } },
    });
  });

  it("answers a replay 200, saying which identity matched", async () => {
    const app = serving();
    const replayed = envelope({ id: "item-1" });

    await post(app, replayed);
    const again = await post(app, replayed);

    expect(again.status).toBe(200);
    expect(again.headers.get("location")).toBeNull();
    expect(await body(again)).toMatchObject({
      kind: "already-captured",
      matchedOn: "id",
    });
  });

  it("captures from a source no config declares", async () => {
    const app = serving();

    const response = await post(app, envelope({ source: "curl" }));

    expect(response.status).toBe(201);
    expect(await body(response)).toMatchObject({ item: { source: "curl" } });
  });

  it("puts the Location it returned at a path that resolves", async () => {
    const app = serving();
    const created = await post(app, envelope({ id: "needs escaping/1" }));

    const location = created.headers.get("location") ?? "";
    const item = await app.request(location);

    expect(item.status).toBe(200);
    expect(await body(item)).toMatchObject({ id: "needs escaping/1" });
  });
});

describe("a capture the pool refuses", () => {
  it("answers 409 when the id exists and the content differs", async () => {
    const app = serving();
    await post(app, envelope({ id: "item-1", text: "a thought" }));

    const conflicting = await post(
      app,
      envelope({ id: "item-1", text: "another thought" }),
    );

    expect(conflicting.status).toBe(409);
    expect(await body(conflicting)).toEqual({
      error: { code: "capture-id-conflict", existing: "item-1" },
    });
  });

  it("answers 409 when the source identity exists and the content differs", async () => {
    const app = serving();
    await post(app, envelope({ id: "item-1", sourceItemId: "src-a" }));

    const changed = await post(
      app,
      envelope({ id: "item-2", sourceItemId: "src-a", text: "edited" }),
    );

    expect(changed.status).toBe(409);
    expect(await body(changed)).toEqual({
      error: { code: "source-item-changed", existing: "item-1" },
    });
  });

  it("answers 422 for a payload type nothing declares", async () => {
    const app = serving();

    const response = await post(app, {
      ...envelope(),
      payload: { ...envelope().payload, type: "video" },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "unknown-payload-type", type: "video" },
    });
  });

  it("answers 422 with the issues when the payload fails its schema", async () => {
    const app = serving();

    const response = await post(app, {
      ...envelope(),
      payload: { ...envelope().payload, content: { text: "" } },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: {
        code: "payload-invalid",
        issues: [{ path: "/text", keyword: "minLength" }],
      },
    });
  });

  it("answers 422 for a missing asset slot", async () => {
    const app = serving({
      ...CONFIG,
      payloadTypes: [{ ...CONFIG.payloadTypes[0]!, requiredSlots: ["audio"] }],
    });

    const response = await post(app, envelope());

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "missing-asset-slot", slot: "audio" },
    });
  });
});

describe("a body the daemon cannot read as an envelope", () => {
  it("answers 400 malformed-json for something that is not JSON", async () => {
    const app = serving();

    const response = await app.request("/v1/captures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: { code: "malformed-json" } });
  });

  it("answers 400 malformed-envelope naming the missing field", async () => {
    const app = serving();
    const { source, ...withoutSource } = envelope();
    void source;

    const response = await post(app, withoutSource);

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      error: {
        code: "malformed-envelope",
        issues: [{ path: "/source", keyword: "required" }],
      },
    });
  });

  it("names a field of the wrong type", async () => {
    const app = serving();

    const response = await post(app, { ...envelope(), sourceItemId: 7 });

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { issues: [{ path: "/sourceItemId", keyword: "type" }] },
    });
  });

  it("refuses a key it does not know rather than dropping it", async () => {
    const app = serving();

    const response = await post(app, { ...envelope(), capturedat: "typo" });

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: {
        code: "malformed-envelope",
        issues: [{ path: "/capturedat", keyword: "additionalProperties" }],
      },
    });
  });

  it("answers 415 when the body is not declared as JSON", async () => {
    const app = serving();

    const response = await app.request("/v1/captures", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(envelope()),
    });

    expect(response.status).toBe(415);
    expect(await body(response)).toEqual({
      error: { code: "unsupported-media-type", contentType: "text/plain" },
    });
  });
});

describe("GET /v1/items/:id", () => {
  it("answers 404 no-such-item for an id the pool has not got", async () => {
    const app = serving();

    const response = await app.request("/v1/items/nothing");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nothing" },
    });
  });
});

describe("GET /v1/feed", () => {
  it("reads newest first, with no next on a single page", async () => {
    const app = serving();
    const ids = await captureMany(app, 3);

    const response = await app.request("/v1/feed");
    const slice = await body(response);

    expect(response.status).toBe(200);
    expect(slice).toMatchObject({
      values: [...ids].reverse().map((id) => ({ id })),
    });
    expect(slice).not.toHaveProperty("next");
  });

  it("pages to exhaustion by following next, without repeating or dropping", async () => {
    const app = serving();
    const ids = await captureMany(app, 5);

    const seen: string[] = [];
    let url = "/v1/feed?limit=2&order=oldest-first";
    let pages = 0;

    for (;;) {
      const slice: { values: { id: string }[]; next?: string } = await body(
        await app.request(url),
      );
      seen.push(...slice.values.map((item) => item.id));
      pages += 1;
      if (slice.next === undefined) break;
      url = slice.next;
    }

    expect(seen).toEqual(ids);
    expect(pages).toBe(3);
  });

  it("hands back a next URL that needs no reassembly", async () => {
    const app = serving();
    await captureMany(app, 3);

    const slice: { next?: string } = await body(
      await app.request("/v1/feed?limit=1&order=oldest-first"),
    );
    const next = new URL(slice.next ?? "", "http://localhost");

    expect(next.pathname).toBe("/v1/feed");
    expect(next.searchParams.get("order")).toBe("oldest-first");
    expect(next.searchParams.get("limit")).toBe("1");
    expect(next.searchParams.get("after")).toBe(
      "2026-08-08T09:00:00.000Z,0198f0c2-0000-7000-8000-000000000000",
    );
  });

  it("takes a bare timestamp as a coarse entry point", async () => {
    const app = serving();
    const ids = await captureMany(app, 5);

    const slice: { values: { id: string }[] } = await body(
      await app.request(
        "/v1/feed?order=oldest-first&after=2026-08-08T09:02:00.000Z",
      ),
    );

    expect(slice.values.map((item) => item.id)).toEqual(ids.slice(3));
  });

  it("reads the other direction from a position it was handed", async () => {
    const app = serving();
    const ids = await captureMany(app, 5);

    const newest: { next?: string } = await body(
      await app.request("/v1/feed?limit=2"),
    );
    const position = new URL(
      newest.next ?? "",
      "http://localhost",
    ).searchParams.get("after");
    const back: { values: { id: string }[] } = await body(
      await app.request(
        `/v1/feed?order=oldest-first&after=${encodeURIComponent(position ?? "")}`,
      ),
    );

    expect(back.values.map((item) => item.id)).toEqual([ids[4]]);
  });

  it("refuses a limit above the maximum rather than clamping it", async () => {
    const app = serving();

    const response = await app.request("/v1/feed?limit=501");

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "limit-too-large", limit: 501, max: 500 },
    });
  });

  it("refuses a limit that is not a count", async () => {
    const app = serving();

    for (const limit of ["0", "abc", "-1", "2.5", ""]) {
      const response = await app.request(`/v1/feed?limit=${limit}`);
      expect(response.status).toBe(422);
      expect(await body(response)).toMatchObject({
        error: { code: "bad-limit", limit },
      });
    }
  });

  it("refuses an order it does not have", async () => {
    const app = serving();

    const response = await app.request("/v1/feed?order=sideways");

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: {
        code: "bad-order",
        order: "sideways",
        allowed: ["newest-first", "oldest-first"],
      },
    });
  });

  it("refuses a position that names no instant", async () => {
    const app = serving();

    const response = await app.request("/v1/feed?after=half%20past%20four");

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "bad-position", after: "half past four" },
    });
  });
});

describe("routing", () => {
  it("answers 404 unknown-route for a path that is not there", async () => {
    const app = serving();

    const response = await app.request("/v1/nothing");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "unknown-route", path: "/v1/nothing" },
    });
  });

  it("answers 405 with Allow for a known path and the wrong method", async () => {
    const app = serving();

    const response = await app.request("/v1/feed", { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
    expect(await body(response)).toEqual({
      error: {
        code: "method-not-allowed",
        method: "DELETE",
        allow: ["GET", "OPTIONS"],
      },
    });
  });

  it("knows an item path is a known path", async () => {
    const app = serving();

    const response = await app.request("/v1/items/anything", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});

describe("the capture page", () => {
  it("is served at the root, as HTML", async () => {
    const app = serving();

    const response = await app.request("/");
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(page).toContain("<title>notemap</title>");
  });

  it("posts to the endpoints this daemon actually answers", async () => {
    const page = await (await serving().request("/")).text();

    expect(page).toContain("/v1/captures");
    expect(page).toContain("/v1/feed");
    // The source id the example config declares, which the page hardcodes.
    expect(page).toContain('const SOURCE = "web"');
  });

  it("is a known path, so the wrong method is 405 rather than 404", async () => {
    const response = await serving().request("/", { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});
