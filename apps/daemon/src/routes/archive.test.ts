import type { Hono } from "hono";
import type { AppEnv } from "../types";
import { afterEach, describe, expect, it } from "vitest";

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

const body = (response: Response) => response.json() as Promise<never>;

describe("archiving over the wire", () => {
  it("answers the item, carrying the reason it was given", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/archive`, {
      reason: "noise",
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      id: first,
      archived: { reason: "noise" },
    });
  });

  it("takes no body at all", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/archive`);

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ id: first });
  });

  it("refuses a second archive as a conflict, and changes nothing", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/archive`, { reason: "the first" });

    const again = await send(app, `/v1/items/${first}/archive`, {
      reason: "the second",
    });

    expect(again.status).toBe(409);
    expect(await body(again)).toMatchObject({
      error: { code: "already-archived", item: first },
    });
    expect(await body(await app.request(`/v1/items/${first}`))).toMatchObject({
      archived: { reason: "the first" },
    });
  });

  it("refuses unarchiving something that is not archived", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/unarchive`);

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: { code: "not-archived", item: first },
    });
  });

  it("answers 404 for an id no item has", async () => {
    const app = serving();

    expect((await send(app, "/v1/items/nobody/archive")).status).toBe(404);
    expect(await body(await send(app, "/v1/items/nobody/unarchive"))).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });

  it("refuses a key the route does not know", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/archive`, {
      resaon: "a typo",
    });

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: {
        code: "malformed-envelope",
        issues: [{ path: "/resaon", keyword: "additionalProperties" }],
      },
    });
  });

  it("refuses a body that is not JSON at all", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const broken = await app.request(`/v1/items/${first}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(broken.status).toBe(400);
    expect(await body(broken)).toEqual({ error: { code: "malformed-json" } });
  });
});
