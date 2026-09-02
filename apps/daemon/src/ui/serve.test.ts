import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import { daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

function app() {
  const started = daemon();
  open.push(started);
  return started.app;
}

const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

/** A daemon with a password set, which is the only state where the door is shut. */
async function guarded(): Promise<Daemon["app"]> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-ui-auth-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });
  stores.push({ store, directory });

  const auth = createAuth(store, { clock: systemClock });
  await auth.setPassword("anton", "correct horse battery staple");

  const started = daemon(undefined, { auth });
  open.push(started);
  return started.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
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

  /**
   * The app is the application, not the pool: everything it draws it asks
   * `/v1` for, and that is what the door is on. Shutting its own paths would
   * answer a person a refusal envelope where they asked for a page — which is
   * the property `/log` carried while the daemon served its own markup for it.
   *
   * Asserted against `/`, because "not 401" is free on a checkout: with no
   * build every one of these is a 404, and a path the door had shut would be
   * one too. What holds either way is that they are answered alike.
   */
  it("does not shut its own paths when the door is shut", async () => {
    const serving = await guarded();
    const root = await serving.request("/");

    for (const path of ["/log", "/settings"]) {
      const response = await serving.request(path);

      expect(response.status).toBe(root.status);
      expect(response.headers.get("content-type")).toBe(
        root.headers.get("content-type"),
      );
    }

    // What those paths would draw is refused to whoever asks for it.
    expect((await serving.request("/v1/actions")).status).toBe(401);
    expect(root.status).not.toBe(401);
  });

  it("still refuses a method the daemon does not answer", async () => {
    const response = await app().request("/v1/feed", { method: "DELETE" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});
