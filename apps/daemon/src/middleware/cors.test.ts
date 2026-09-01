import { afterEach, describe, expect, it } from "vitest";

import { captureMany, daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function serving() {
  const host = daemon();
  open.push(host);
  return host.app;
}

const ELSEWHERE = { origin: "https://evil.example" };

/**
 * The one thing stopping a page on another origin reading the pool of whoever
 * is signed in. It is an absence, so nothing about the code says it is there —
 * which is exactly why it is asserted rather than assumed.
 */
describe("what the daemon says to another origin", () => {
  it("carries no Access-Control-Allow-* on anything it answers", async () => {
    const app = serving();
    const [first] = await captureMany(app, 1);

    const answers = await Promise.all([
      app.request("/v1/feed", { headers: ELSEWHERE }),
      app.request(`/v1/items/${first}`, { headers: ELSEWHERE }),
      app.request("/v1/health", { headers: ELSEWHERE }),
      app.request("/v1/session", { headers: ELSEWHERE }),
      app.request("/v1/openapi.json", { headers: ELSEWHERE }),
      app.request("/v1/destinations", { headers: ELSEWHERE }),
      // A refusal answers from a different place in the stack, and would be
      // just as useful to read across origins.
      app.request("/v1/items/no-such-item", { headers: ELSEWHERE }),
      app.request("/v1/captures", {
        method: "POST",
        headers: { ...ELSEWHERE, "content-type": "text/plain" },
        body: "{}",
      }),
      // Preflight, which is the shape a browser asks the question in.
      app.request("/v1/feed", { method: "OPTIONS", headers: ELSEWHERE }),
    ]);

    for (const answer of answers) {
      const said = [...answer.headers.keys()].filter((name) =>
        name.toLowerCase().startsWith("access-control-"),
      );

      expect(
        said,
        `${String(answer.status)} carried ${said.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("says nothing different to a page than to a caller with no origin", async () => {
    const app = serving();

    const [asked, unasked] = await Promise.all([
      app.request("/v1/health", { headers: ELSEWHERE }),
      app.request("/v1/health"),
    ]);

    expect([...asked.headers.keys()].sort()).toEqual(
      [...unasked.headers.keys()].sort(),
    );
  });
});
