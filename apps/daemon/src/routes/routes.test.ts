import { writeFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  CONFIG,
  daemon,
  envelope,
  post,
  NOTE,
  WEB,
  type Daemon,
} from "../testing/fixture";

const open: Daemon[] = [];

function started(...args: Parameters<typeof daemon>): Daemon {
  const host = daemon(...args);
  open.push(host);
  return host;
}

function serving(...args: Parameters<typeof daemon>) {
  return started(...args).app;
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
      item: { id: "item-1", source: WEB, payload: { type: NOTE } },
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
      payload: { ...envelope().payload, content: { text: 12 } },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: {
        code: "payload-invalid",
        issues: [{ path: "/text", keyword: "type" }],
      },
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

  it("answers 415 when the body is not declared as application/json", async () => {
    const app = serving();

    for (const contentType of ["text/plain", "text/json", "application/xml"]) {
      const response = await app.request("/v1/captures", {
        method: "POST",
        headers: { "content-type": contentType },
        body: JSON.stringify(envelope()),
      });

      expect(response.status, contentType).toBe(415);
      expect(await body(response)).toEqual({
        error: { code: "unsupported-media-type", contentType },
      });
    }
  });

  it("accepts application/json with parameters on it", async () => {
    const app = serving();

    const response = await app.request("/v1/captures", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(envelope()),
    });

    expect(response.status).toBe(201);
  });

  it("answers 400 for a capturedAt that names no instant", async () => {
    const app = serving();

    const response = await post(app, envelope({ capturedAt: "yesterday" }));

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      error: {
        code: "malformed-envelope",
        issues: [{ path: "/capturedAt", keyword: "format" }],
      },
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

    while (true) {
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

describe("GET /v1/actions", () => {
  type Entry = { kind: string; subject?: string; at: string };
  type LogPage = { values: Entry[]; next?: string };

  it("reads newest first, timed by arrival rather than by capture time", async () => {
    const app = serving();
    const ids = await captureMany(app, 3);

    const response = await app.request("/v1/actions");
    const slice: LogPage = await body(response);

    expect(response.status).toBe(200);
    expect(slice.values.map((entry) => entry.subject)).toEqual(
      [...ids].reverse(),
    );
    expect(slice.values.map((entry) => entry.kind)).toEqual([
      "captured",
      "captured",
      "captured",
    ]);
    // The captures are timed 09:00, 09:01, 09:02; their entries are not.
    for (const entry of slice.values) {
      expect(entry.at.startsWith("2026-08-08T09:0")).toBe(false);
    }
  });

  it("narrows to one subject", async () => {
    const app = serving();
    const ids = await captureMany(app, 3);

    const slice: LogPage = await body(
      await app.request(`/v1/actions?item=${ids[1]}`),
    );

    expect(slice.values.map((entry) => entry.subject)).toEqual([ids[1]]);
  });

  it("narrows to the kinds named, and carries the filter in next", async () => {
    const app = serving();
    const ids = await captureMany(app, 2);
    for (const id of ids) {
      await app.request(`/v1/items/${id}/tag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag: "kind/quote" }),
      });
    }

    const slice: LogPage = await body(
      await app.request("/v1/actions?kind=tagged,untagged&limit=1"),
    );

    expect(slice.values.map((entry) => entry.kind)).toEqual(["tagged"]);
    expect(slice.next ?? "").toContain("kind=tagged%2Cuntagged");
  });

  it("refuses a kind the log never writes", async () => {
    const app = serving();

    const response = await app.request("/v1/actions?kind=captured,shouted");

    expect(response.status).toBe(422);
    expect(
      (await body<{ error: { code: string; value: string } }>(response)).error,
    ).toMatchObject({
      code: "bad-kind",
      value: "shouted",
    });
  });

  it("answers an empty page for a subject no item has, never a 404", async () => {
    const app = serving();
    await captureMany(app, 1);

    const response = await app.request("/v1/actions?item=never-existed");

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ values: [] });
  });

  it("pages to exhaustion by following next, without repeating or dropping", async () => {
    const app = serving();
    const ids = await captureMany(app, 3);

    const seen: string[] = [];
    let url = "/v1/actions?limit=1&order=oldest-first";

    for (;;) {
      const slice: LogPage = await body(await app.request(url));
      seen.push(...slice.values.map((entry) => entry.subject ?? ""));
      if (slice.next === undefined) break;
      url = slice.next;
    }

    expect(seen).toEqual(ids);
  });

  it("carries the filter into next, so a filtered read pages as itself", async () => {
    const host = started(CONFIG, { mirroring: true });
    const { app } = host;

    await post(app, envelope({ id: "item-1" }));
    // A file where the mirror tree should be: the write fails, and the failed
    // attempt gives one item the second entry a filtered page boundary needs.
    writeFileSync(host.mirrorRoot, "not a directory", "utf8");
    expect(await host.drain()).toBe(1);

    await post(app, envelope({ id: "item-2" }));

    const first: LogPage = await body(
      await app.request("/v1/actions?limit=1&item=item-1"),
    );
    expect(first.values.map((entry) => entry.kind)).toEqual(["work-failed"]);
    expect(
      new URL(first.next ?? "", "http://localhost").searchParams.get("item"),
    ).toBe("item-1");

    const second: LogPage = await body(await app.request(first.next ?? ""));
    expect(second.values).toEqual([
      expect.objectContaining({ kind: "captured", subject: "item-1" }),
    ]);
    expect(second.next).toBeUndefined();
  });

  it("refuses a parameter the way every paginated read does", async () => {
    const app = serving();

    expect((await app.request("/v1/actions?limit=501")).status).toBe(422);
    expect(await body(await app.request("/v1/actions?order=sideways"))).toEqual(
      {
        error: {
          code: "bad-order",
          order: "sideways",
          allowed: ["newest-first", "oldest-first"],
        },
      },
    );
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

describe("the instants a capture may name", () => {
  it("normalises an offset to UTC before the pool sees it", async () => {
    const app = serving();

    const response = await post(
      app,
      envelope({ capturedAt: "2026-08-08T09:00:00+02:00" }),
    );

    expect(response.status).toBe(201);
    expect(await body(response)).toMatchObject({
      item: { createdAt: "2026-08-08T07:00:00.000Z" },
    });
  });

  it("takes a date alone as midnight UTC", async () => {
    const app = serving();

    const response = await post(app, envelope({ capturedAt: "2026-08-08" }));

    expect(response.status).toBe(201);
    expect(await body(response)).toMatchObject({
      item: { createdAt: "2026-08-08T00:00:00.000Z" },
    });
  });

  it("refuses a date-time with no offset rather than guessing a zone", async () => {
    const app = serving();

    const response = await post(
      app,
      envelope({ capturedAt: "2026-08-08T09:00:00" }),
    );

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: { issues: [{ path: "/capturedAt", keyword: "format" }] },
    });
  });

  it("refuses a date that does not exist", async () => {
    const app = serving();

    const response = await post(app, envelope({ capturedAt: "2026-02-31" }));

    expect(response.status).toBe(400);
  });
});

describe("OPTIONS", () => {
  it("answers a known path with 204 and the methods it allows", async () => {
    const app = serving();

    const response = await app.request("/v1/feed", { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("answers an unknown path 404 rather than advertising nothing", async () => {
    const app = serving();

    const response = await app.request("/v1/nothing", { method: "OPTIONS" });

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "unknown-route", path: "/v1/nothing" },
    });
  });

  it("does not appear in Allow on a path that answers nothing", async () => {
    const app = serving();

    const response = await app.request("/v1/nothing", { method: "DELETE" });

    expect(response.status).toBe(404);
  });
});

describe("paths that only look like routes", () => {
  it("does not let a dot in a route path match any character", async () => {
    const app = serving();

    const response = await app.request("/v1/openapiXjson");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "unknown-route", path: "/v1/openapiXjson" },
    });
  });

  it("still matches the real path", async () => {
    const app = serving();

    expect((await app.request("/v1/openapi.json")).status).toBe(200);
  });
});
