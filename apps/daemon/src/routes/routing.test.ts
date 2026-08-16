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

describe("marking an item processed over the wire", () => {
  it("answers the routing record it appended", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await send(app, `/v1/items/${first}/mark-processed`, {
      note: "into the vault",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(await body(response)).toMatchObject({
      item: first,
      target: { kind: "user", note: "into the vault" },
    });
  });

  it("leaves the item in the feed, unarchived", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    await send(app, `/v1/items/${first}/mark-processed`);

    expect(ids(await slice(app, "/v1/feed"))).toEqual([first]);
    expect(await slice(app, "/v1/archived")).toEqual({ values: [] });
  });

  it("answers 404 for an id no item has", async () => {
    const app = serving();

    const response = await send(app, "/v1/items/nobody/mark-processed");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });
});

describe("GET /v1/items/:id/routing", () => {
  it("answers every record, oldest first", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);
    await send(app, `/v1/items/${first}/mark-processed`, { note: "one" });

    const response = await app.request(`/v1/items/${first}/routing`);

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      values: [{ item: first, target: { kind: "user", note: "one" } }],
    });
  });

  it("answers an empty list for an item that has been nowhere", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    expect(await body(await app.request(`/v1/items/${first}/routing`))).toEqual(
      { values: [] },
    );
  });

  it("answers 404 for an id no item has, unlike the action log", async () => {
    const app = serving();

    const response = await app.request("/v1/items/nobody/routing");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "no-such-item", item: "nobody" },
    });
  });
});
