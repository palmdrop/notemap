import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { daemon, type Daemon } from "./testing/fixture";

/**
 * Over a real listener rather than `app.request`. The two differ in ways that
 * have already bitten: a bodyless request has a null body in one and a readable
 * stream in the other.
 */
const running: { close: () => void }[] = [];
const open: Daemon[] = [];

async function listening(): Promise<string> {
  const started = daemon();
  open.push(started);

  return new Promise((resolve) => {
    const server = serve(
      { fetch: started.app.fetch, hostname: "127.0.0.1", port: 0 },
      (address: AddressInfo) => resolve(`http://127.0.0.1:${address.port}`),
    );
    running.push({ close: () => server.close() });
  });
}

afterEach(async () => {
  for (const server of running.splice(0)) server.close();
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

describe("against a real listener", () => {
  it("answers OPTIONS with 204 and Allow, not 415", async () => {
    const base = await listening();

    const response = await fetch(`${base}/v1/feed`, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("does not ask a bodyless GET for a content type", async () => {
    const base = await listening();

    expect((await fetch(`${base}/v1/feed`)).status).toBe(200);
    expect((await fetch(`${base}/docs`)).status).toBe(200);
  });

  it("still refuses a POST that is not JSON", async () => {
    const base = await listening();

    const response = await fetch(`${base}/v1/captures`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    expect(response.status).toBe(415);
  });

  it("captures and reads back over the wire", async () => {
    const base = await listening();

    const created = await fetch(`${base}/v1/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "over-the-wire",
        source: "web",
        sourceItemId: "over-the-wire",
        capturedAt: "2026-08-08T09:00:00+02:00",
        payload: {
          type: "text",
          content: { text: "a thought" },
          metadata: {},
          assets: [],
        },
      }),
    });

    expect(created.status).toBe(201);

    const location = created.headers.get("location") ?? "";
    const item = (await (await fetch(`${base}${location}`)).json()) as {
      createdAt: string;
    };

    expect(item.createdAt).toBe("2026-08-08T07:00:00.000Z");
  });
});
