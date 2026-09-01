import type { Hono } from "hono";
import type { AppEnv } from "../types";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureMany,
  createVault,
  daemon,
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

const JSON_TYPE = { "content-type": "application/json" };

describe("the media type a body arrives under", () => {
  it("lets an empty body through on every route whose body is optional", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    for (const path of [
      `/v1/items/${first}/archive`,
      `/v1/items/${first}/unarchive`,
      `/v1/items/${first}/mark-processed`,
    ]) {
      const response = await app.request(path, {
        method: "POST",
        headers: JSON_TYPE,
      });
      expect(response.status, path).toBe(200);
    }
  });

  it("lets a declared POST through on a route that takes no body", async () => {
    const host = daemon();
    open.push(host);
    const vault = await createVault(host);

    const bare = await host.app.request(`/v1/destinations/${vault.id}/retire`, {
      method: "POST",
      headers: JSON_TYPE,
    });
    expect(bare.status).toBe(200);

    const framed = await host.app.request(
      `/v1/destinations/${vault.id}/unretire`,
      { method: "POST", headers: JSON_TYPE, body: "" },
    );
    expect(framed.status).toBe(200);
  });

  /**
   * The whole of what stops a cross-site page writing to the pool. A form
   * declares one of three media types and a bodyless `fetch` declares none,
   * none of which is this one — so every shape a browser sends without asking
   * the daemon first is refused before it reaches a route.
   */
  it("refuses a write that declares nothing, body or no body", async () => {
    const host = daemon();
    open.push(host);
    const vault = await createVault(host);
    const [first] = await captureMany(host.app, 1);

    for (const path of [
      `/v1/items/${first}/archive`,
      `/v1/items/${first}/unarchive`,
      `/v1/items/${first}/mark-processed`,
      `/v1/destinations/${vault.id}/retire`,
      `/v1/destinations/${vault.id}/unretire`,
    ]) {
      const bare = await host.app.request(path, { method: "POST" });
      expect(bare.status, path).toBe(415);

      const asAForm = await host.app.request(path, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
      });
      expect(asAForm.status, path).toBe(415);
    }
  });

  it("still holds a bodied route sharing its path with a bodyless one", async () => {
    const host = daemon();
    open.push(host);
    const vault = await createVault(host);

    const created = await host.app.request("/v1/destinations", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({
        name: "Second",
        kind: "filesystem",
        settings: { root: host.vaultRoot },
      }),
    });
    expect(created.status).toBe(415);

    const edited = await host.app.request(`/v1/destinations/${vault.id}`, {
      method: "PATCH",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(edited.status).toBe(415);
  });

  it("refuses a bare POST where the body is required", async () => {
    const app = serving();

    const response = await app.request("/v1/captures", { method: "POST" });

    expect(response.status).toBe(415);
    expect(await body(response)).toEqual({
      error: { code: "unsupported-media-type", contentType: "" },
    });
  });

  it("refuses a body under the wrong media type, optional or not", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const response = await app.request(`/v1/items/${first}/archive`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "noise",
    });

    expect(response.status).toBe(415);
    expect(await body(response)).toEqual({
      error: { code: "unsupported-media-type", contentType: "text/plain" },
    });
  });
});
