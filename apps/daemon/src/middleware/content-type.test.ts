import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { captureMany, daemon, type Daemon } from "../testing/fixture";

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

describe("the media type a body arrives under", () => {
  it("lets a bare POST through on every route whose body is optional", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    for (const path of [
      `/v1/items/${first}/archive`,
      `/v1/items/${first}/unarchive`,
      `/v1/items/${first}/mark-processed`,
    ]) {
      const response = await app.request(path, { method: "POST" });
      expect(response.status, path).toBe(200);
    }
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
