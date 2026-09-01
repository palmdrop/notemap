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

/** A daemon with a password set and one session signed in. */
async function guarded(): Promise<{
  app: Hono<AppEnv>;
  auth: Auth;
  cookie: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-route-tokens-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });
  stores.push({ store, directory });

  const auth = createAuth(store, { clock: systemClock });
  await auth.setPassword(NAME, PASSWORD);

  const host = daemon(undefined, { auth });
  open.push(host);

  const signedIn = await host.app.request("/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, password: PASSWORD }),
  });

  return {
    app: host.app,
    auth,
    cookie: (signedIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
  };
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

const body = (response: Response) => response.json() as Promise<never>;

const mint = (app: Hono<AppEnv>, cookie: string, content: unknown) =>
  app.request("/v1/tokens", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(content),
  });

describe("minting a token over the wire", () => {
  it("answers 201 and the token itself, once", async () => {
    const { app, cookie } = await guarded();

    const response = await mint(app, cookie, { name: "laptop" });
    const minted = (await body(response)) as { token: string; id: string };

    expect(response.status).toBe(201);
    expect(minted.token).toContain(minted.id);
  });

  it("never shows the token again", async () => {
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
    };

    const listed = await app.request("/v1/tokens", { headers: { cookie } });

    expect(JSON.stringify(await body(listed))).not.toContain(minted.token);
  });

  // Read as text rather than by field, so a stored secret is caught whatever
  // name it arrives under.
  it("puts no stored secret in either answer", async () => {
    const { app, cookie } = await guarded();

    const minted = await (await mint(app, cookie, { name: "laptop" })).text();
    const listed = await (
      await app.request("/v1/tokens", { headers: { cookie } })
    ).text();

    expect(minted).not.toContain("secretHash");
    expect(listed).not.toContain("secretHash");
  });

  it("takes an expiry, and does without one", async () => {
    const { app, cookie } = await guarded();

    const dated = await mint(app, cookie, {
      name: "ci",
      expiresAt: "2026-11-30T09:00:00.000Z",
    });
    const forever = await mint(app, cookie, { name: "laptop" });

    expect(dated.status).toBe(201);
    expect(forever.status).toBe(201);
    expect(await body(dated)).toMatchObject({
      expiresAt: "2026-11-30T09:00:00.000Z",
    });
  });

  it("refuses a body it cannot read", async () => {
    const { app, cookie } = await guarded();

    expect((await mint(app, cookie, { name: "" })).status).toBe(400);
    expect((await mint(app, cookie, {})).status).toBe(400);
    expect(
      (await mint(app, cookie, { name: "ci", expiresAt: "whenever" })).status,
    ).toBe(400);
  });
});

describe("a minted token as a credential", () => {
  it("opens the door as a bearer token", async () => {
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
    };

    const response = await app.request("/v1/feed", {
      headers: { authorization: `Bearer ${minted.token}` },
    });

    expect(response.status).toBe(200);
  });

  it("is refused once revoked", async () => {
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
      id: string;
    };

    const revoked = await app.request(`/v1/tokens/${minted.id}`, {
      method: "DELETE",
      headers: { cookie },
    });

    expect(revoked.status).toBe(204);
    expect(
      (
        await app.request("/v1/feed", {
          headers: { authorization: `Bearer ${minted.token}` },
        })
      ).status,
    ).toBe(401);
  });

  it("is refused when the header is not a bearer", async () => {
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
    };

    const response = await app.request("/v1/feed", {
      headers: { authorization: minted.token },
    });

    expect(response.status).toBe(401);
  });

  it("does not take a good session down with it", async () => {
    // A bad token must not clear the cookie of a browser that is signed in.
    const { app, cookie } = await guarded();

    const response = await app.request("/v1/feed", {
      headers: { cookie, authorization: "Bearer nmp.nosuchtoken1.abcdef" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      (await app.request("/v1/feed", { headers: { cookie } })).status,
    ).toBe(200);
  });
});

describe("who may manage tokens", () => {
  it("turns away an unauthenticated caller", async () => {
    const { app } = await guarded();

    expect((await app.request("/v1/tokens")).status).toBe(401);
    expect(
      (await app.request("/v1/tokens/anything", { method: "DELETE" })).status,
    ).toBe(401);
  });

  it("stops a token from minting itself a successor", async () => {
    // A leaked token could otherwise mint a replacement that outlives revoking
    // the original, so revocation would not be the end of it.
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
    };

    const response = await app.request("/v1/tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${minted.token}`,
      },
      body: JSON.stringify({ name: "second" }),
    });

    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({
      error: { code: "session-required" },
    });
  });

  it("stops a token reading or revoking what exists", async () => {
    const { app, cookie } = await guarded();
    const first = (await body(await mint(app, cookie, { name: "laptop" }))) as {
      token: string;
      id: string;
    };

    const bearer = { authorization: `Bearer ${first.token}` };

    expect((await app.request("/v1/tokens", { headers: bearer })).status).toBe(
      403,
    );
    expect(
      (
        await app.request(`/v1/tokens/${first.id}`, {
          method: "DELETE",
          headers: bearer,
        })
      ).status,
    ).toBe(403);
  });

  it("still lets a token through the doors it is for", async () => {
    const { app, cookie } = await guarded();
    const minted = (await body(
      await mint(app, cookie, { name: "laptop" }),
    )) as {
      token: string;
    };

    expect(
      (
        await app.request("/v1/feed", {
          headers: { authorization: `Bearer ${minted.token}` },
        })
      ).status,
    ).toBe(200);
  });

  it("takes revoking one that was never there", async () => {
    const { app, cookie } = await guarded();

    const response = await app.request("/v1/tokens/nosuchtoken1111", {
      method: "DELETE",
      headers: { cookie },
    });

    expect(response.status).toBe(204);
  });
});
