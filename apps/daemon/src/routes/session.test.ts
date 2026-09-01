import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import { createLoginThrottle, type Throttle } from "../auth/throttle";
import type { AuthStore } from "../auth/store/types";
import type { CookieOptions } from "../auth/sessions/config";
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
async function guarded(
  throttle?: Throttle,
  cookies?: CookieOptions,
): Promise<{
  app: Hono<AppEnv>;
  auth: Auth;
}> {
  const auth = authOver();
  await auth.setPassword(NAME, PASSWORD);

  const host = daemon(undefined, {
    auth,
    ...(throttle === undefined ? {} : { throttle }),
    ...(cookies === undefined ? {} : { cookies }),
  });
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

  /** Which pool this is, is a fact about the pool, and goes behind the door. */
  it("answers health with liveness alone to a caller it does not know", async () => {
    const { app } = await guarded();

    const said = await body(await app.request("/v1/health"));

    expect(said).toHaveProperty("version");
    expect(said).not.toHaveProperty("pool");
  });

  it("names the pool once someone has signed in", async () => {
    const { app } = await guarded();
    const cookie = cookieFrom(await login(app));

    const said = await body(
      await app.request("/v1/health", { headers: { cookie } }),
    );

    expect(said).toHaveProperty("pool");
  });

  /** A daemon nobody has set a password on has no door to be outside of. */
  it("names the pool to everyone where no password is set", async () => {
    const said = await body(await unguarded().request("/v1/health"));

    expect(said).toHaveProperty("pool");
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

describe("the cookie a sign-in mints", () => {
  const setBy = async (cookies: CookieOptions) => {
    const { app } = await guarded(undefined, cookies);
    return (await login(app)).headers.get("set-cookie") ?? "";
  };

  it("is named plainly where the origin is not TLS", async () => {
    const said = await setBy({ secure: true, prefixed: false });

    expect(said).toMatch(/^session=/);
    expect(said).not.toContain("__Host-");
  });

  /**
   * The prefix and the attributes are one decision to a browser: Chromium
   * rejects a prefixed cookie over `http:` outright, loopback included, so a
   * loopback daemon issuing one signs nobody in and says nothing about why.
   */
  it("takes the __Host- prefix only where the origin is", async () => {
    expect(await setBy({ secure: true, prefixed: true })).toMatch(
      /^__Host-session=/,
    );
  });

  it("carries what the prefix promises either way", async () => {
    for (const prefixed of [false, true]) {
      const said = await setBy({ secure: true, prefixed });

      expect(said).toContain("Path=/");
      expect(said).toContain("HttpOnly");
      expect(said).toContain("Secure");
      expect(said).toContain("SameSite=Lax");
      expect(said).not.toContain("Domain=");
    }
  });

  it("gives up Secure where plain HTTP crosses a network", async () => {
    const said = await setBy({ secure: false, prefixed: false });

    expect(said).not.toContain("Secure");
  });

  it("is read back under the name it was set under", async () => {
    const cookies = { secure: true, prefixed: true } as const;
    const { app } = await guarded(undefined, cookies);
    const cookie = cookieFrom(await login(app));

    expect(cookie).toMatch(/^__Host-session=/);
    expect(
      (await app.request("/v1/feed", { headers: { cookie } })).status,
    ).toBe(200);
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

    expect(
      (await app.request("/v1/feed", { headers: { cookie } })).status,
    ).toBe(401);
  });

  it("takes signing out when nothing was presented", async () => {
    const { app } = await guarded();

    expect(
      (await app.request("/v1/session", { method: "DELETE" })).status,
    ).toBe(204);
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

  /**
   * Signing every browser out is what someone does so a leak is noticed, so it
   * is not a thing a leaked token may do — the same containment as the token
   * routes, arriving from the other direction.
   */
  it("is refused to an access token, which may not end sessions", async () => {
    const { app, auth } = await guarded();
    const minted = await auth.mintToken("laptop");

    const response = await app.request("/v1/sessions", {
      method: "DELETE",
      headers: { authorization: `Bearer ${minted.token}` },
    });

    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({
      error: { code: "session-required" },
    });
  });

  it("is allowed to a session, which is the point of it", async () => {
    const { app } = await guarded();
    const cookie = cookieFrom(await login(app));

    const response = await app.request("/v1/sessions", {
      method: "DELETE",
      headers: { cookie },
    });

    expect(response.status).toBe(204);
    expect(
      (await app.request("/v1/feed", { headers: { cookie } })).status,
    ).toBe(401);
  });

  it("is behind the door, unlike signing out of this session alone", async () => {
    const { app } = await guarded();

    expect(
      (await app.request("/v1/sessions", { method: "DELETE" })).status,
    ).toBe(401);
  });
});

describe("guessing at the password", () => {
  /** Enough to pass the free attempts and open a wait, whatever they are set to. */
  const WRONG_ENOUGH = 12;

  const movable = () => {
    let current = Date.parse("2026-08-31T09:00:00.000Z");
    return {
      throttle: createLoginThrottle({
        clock: { now: () => new Date(current).toISOString() as Timestamp },
      }),
      pass: (ms: number) => {
        current += ms;
      },
    };
  };

  it("is turned away once too much of it has been done", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < WRONG_ENOUGH; attempt += 1) {
      await login(app, "not the password");
    }

    const response = await login(app, "not the password");

    expect(response.status).toBe(429);
    expect(await body(response)).toMatchObject({
      error: { code: "too-many-attempts" },
    });
  });

  it("says when to come back, in the header and in the envelope", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < WRONG_ENOUGH; attempt += 1) {
      await login(app, "not the password");
    }

    const response = await login(app, "not the password");
    const said = (await body(response)) as {
      error: { retryAfter: number };
    };

    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(said.error.retryAfter).toBe(
      Number(response.headers.get("retry-after")),
    );
  });

  /** The right password is refused while the door is shut, which is the point. */
  it("turns away the right password too, until the wait has passed", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < WRONG_ENOUGH; attempt += 1) {
      await login(app, "not the password");
    }

    expect((await login(app)).status).toBe(429);

    clock.pass(60_000);

    expect((await login(app)).status).toBe(200);
  });

  it("forgets the count once someone signs in", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < WRONG_ENOUGH; attempt += 1) {
      await login(app, "not the password");
    }

    clock.pass(60_000);
    expect((await login(app)).status).toBe(200);

    // Back to the free attempts, rather than to where the count had climbed.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(app, "not the password")).status).toBe(401);
    }
  });

  /**
   * The decision this stands behind: a session id and an access token are 32
   * random bytes, so guessing one is not an attack, and counting the refusals
   * would let an outbox draining with an expired session throttle its owner out
   * of the one route that fixes it.
   */
  it("does not count a refusal from any other route", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const refused = await app.request("/v1/feed", {
        headers: { authorization: "Bearer nmp.nosuchtoken1111.aGVsbG8" },
      });
      expect(refused.status).toBe(401);
    }

    expect((await login(app)).status).toBe(200);
  });

  it("does not count a body it could not read as a guess", async () => {
    const clock = movable();
    const { app } = await guarded(clock.throttle);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const refused = await app.request("/v1/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: NAME }),
      });
      expect(refused.status).toBe(400);
    }

    expect((await login(app)).status).toBe(200);
  });
});
