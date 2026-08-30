import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import type { Auth } from "../auth/types";
import { daemon, type Daemon } from "../testing/fixture";
import type { AppEnv } from "../types";

const NAME = "anton";
const PASSWORD = "correct horse battery staple";

const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

const open: Daemon[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

function authOver(): Auth {
  const directory = mkdtempSync(join(tmpdir(), "notemap-route-auth-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  stores.push({ store, directory });
  return createAuth(store, { clock: systemClock });
}

/** A daemon with a password set, which is the only state where the door is shut. */
async function guarded(): Promise<{ app: Hono<AppEnv>; auth: Auth }> {
  const auth = authOver();
  await auth.setPassword(NAME, PASSWORD);

  const host = daemon(undefined, { auth });
  open.push(host);

  return { app: host.app, auth };
}

/** A daemon nobody has set a password on, which lets everything through. */
function unguarded(): Hono<AppEnv> {
  const host = daemon(undefined, { auth: authOver() });
  open.push(host);
  return host.app;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

const login = (app: Hono<AppEnv>, password = PASSWORD) =>
  app.request("/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, password }),
  });

/** The cookie as a browser would send it back. */
const cookieFrom = (response: Response) =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

const body = (response: Response) => response.json() as Promise<never>;

describe("the door", () => {
  it("lets everything through until a password is set", async () => {
    expect((await unguarded().request("/v1/feed")).status).toBe(200);
  });

  it("turns away a request carrying nothing once one is", async () => {
    const { app } = await guarded();

    expect((await app.request("/v1/feed")).status).toBe(401);
  });

  it("leaves health open, so a container can ask without a credential", async () => {
    const { app } = await guarded();

    expect((await app.request("/v1/health")).status).toBe(200);
  });

  it("turns away a cookie nobody minted", async () => {
    const { app } = await guarded();

    const response = await app.request("/v1/feed", {
      headers: { cookie: "session=forged.abcdef" },
    });

    expect(response.status).toBe(401);
  });

  it("tells the browser to drop a cookie that can never work", async () => {
    // Otherwise every later request carries a cookie that is refused again,
    // and the browser is never told it is dead.
    const { app } = await guarded();

    const response = await app.request("/v1/feed", {
      headers: { cookie: "session=forged.abcdef" },
    });

    expect(response.headers.get("set-cookie")).toContain("session=");
  });
});

describe("signing in over the wire", () => {
  it("answers the identity and sets a cookie", async () => {
    const { app } = await guarded();

    const response = await login(app);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ authenticated: true });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("opens the door for the cookie it just set", async () => {
    const { app } = await guarded();
    const cookie = cookieFrom(await login(app));

    const response = await app.request("/v1/feed", { headers: { cookie } });

    expect(response.status).toBe(200);
  });

  it("refuses the wrong password without saying which half was wrong", async () => {
    const { app } = await guarded();

    const response = await login(app, "wrong");

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await body(response)).toMatchObject({
      error: { code: "unauthenticated" },
    });
  });
});

describe("asking who this is", () => {
  it("answers without a credential rather than turning the caller away", async () => {
    const { app } = await guarded();

    const response = await app.request("/v1/session");

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      authenticated: false,
      requiresCredentials: true,
    });
  });

  it("says the daemon asks for nothing where no password is set", async () => {
    const response = await unguarded().request("/v1/session");

    expect(await body(response)).toMatchObject({
      authenticated: false,
      requiresCredentials: false,
    });
  });

  it("names the session once one is signed in", async () => {
    const { app } = await guarded();
    const cookie = cookieFrom(await login(app));

    const response = await app.request("/v1/session", { headers: { cookie } });

    expect(await body(response)).toMatchObject({
      authenticated: true,
      identity: { kind: "session" },
    });
  });
});

describe("signing out", () => {
  it("ends the session and clears the cookie", async () => {
    const { app } = await guarded();
    const cookie = cookieFrom(await login(app));

    const response = await app.request("/v1/session", {
      method: "DELETE",
      headers: { cookie },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("session=");

    expect((await app.request("/v1/feed", { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it("takes signing out when nothing was presented", async () => {
    const { app } = await guarded();

    expect((await app.request("/v1/session", { method: "DELETE" })).status).toBe(
      204,
    );
  });

  it("refuses to sign out an access token, which is not a session", async () => {
    const { app, auth } = await guarded();
    const minted = await auth.mintToken("laptop");

    const response = await app.request("/v1/session", {
      method: "DELETE",
      headers: { authorization: `Bearer ${minted.token}` },
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: "not-a-session" },
    });
  });
});

describe("signing out everywhere", () => {
  it("ends every session at once", async () => {
    const { app } = await guarded();
    const first = cookieFrom(await login(app));
    const second = cookieFrom(await login(app));

    const response = await app.request("/v1/sessions", {
      method: "DELETE",
      headers: { cookie: first },
    });

    expect(response.status).toBe(204);

    for (const cookie of [first, second]) {
      expect(
        (await app.request("/v1/feed", { headers: { cookie } })).status,
        cookie,
      ).toBe(401);
    }
  });

  it("is behind the door, unlike signing out of this session alone", async () => {
    const { app } = await guarded();

    expect((await app.request("/v1/sessions", { method: "DELETE" })).status).toBe(
      401,
    );
  });
});
