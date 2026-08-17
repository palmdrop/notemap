import { afterEach, describe, expect, it } from "vitest";

import { daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function app() {
  const started = daemon();
  open.push(started);
  return started.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

/**
 * These hold whether or not `public/ui` has a build in it, which is what makes
 * them worth having: the suite runs against a checkout, and the app is copied
 * in by a build step that a test must not depend on.
 */
describe("serving the app", () => {
  it("leaves an unknown /v1 path as a refusal", async () => {
    const response = await app().request("/v1/nope");
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("unknown-route");
  });

  it("does not answer a missing file with the shell", async () => {
    const response = await app().request("/_app/immutable/gone.js");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain("text/html");
  });

  it("does not read outside the app directory", async () => {
    const response = await app().request("/%2e%2e%2f%2e%2e%2fpackage.json");

    expect(await response.text()).not.toContain("@notemap/daemon");
  });

  it("answers HEAD wherever it answers GET", async () => {
    const serving = app();
    const read = await serving.request("/");
    const looked = await serving.request("/", { method: "HEAD" });

    expect(looked.status).toBe(read.status);
    expect(looked.headers.get("content-type")).toBe(
      read.headers.get("content-type"),
    );
  });

  it("still refuses a method the daemon does not answer", async () => {
    const response = await app().request("/v1/feed", { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});
