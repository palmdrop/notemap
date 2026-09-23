import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import type { Account } from "../config/load";
import { openAccounts, systemClock } from "../ports";
import { daemon, type Daemon } from "../testing/fixture";
import type { AppEnv } from "../types";

const NAME = "anton";
const PASSWORD = "correct horse battery staple";
const SECRET = "an-app-password-nobody-may-read";

const open: Daemon[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

/** A daemon with a password set, one session signed in, and one access token minted. */
async function guarded(config: readonly Account[] = []): Promise<{
  host: Daemon;
  app: Hono<AppEnv>;
  cookie: string;
  bearer: string;
}> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-route-accounts-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });
  stores.push({ store, directory });

  const auth = createAuth(store, { clock: systemClock });
  await auth.setPassword(NAME, PASSWORD);
  const minted = await auth.mintToken("laptop");

  const accounts = await openAccounts({ store, config, clock: systemClock });

  const host = daemon(undefined, { auth, accounts });
  open.push(host);

  const signedIn = await host.app.request("/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, password: PASSWORD }),
  });

  return {
    host,
    app: host.app,
    cookie: (signedIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
    bearer: `Bearer ${minted.token}`,
  };
}

const body = (response: Response) => response.json() as Promise<never>;

const FIELDS = {
  baseUrl: "https://cloud.example/remote.php/dav/files/alice",
  username: "alice",
};

const put = (
  app: Hono<AppEnv>,
  headers: Record<string, string>,
  path: string,
  content: unknown,
) =>
  app.request(`/v1/accounts/${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(content),
  });

const remove = (
  app: Hono<AppEnv>,
  headers: Record<string, string>,
  path: string,
) => app.request(`/v1/accounts/${path}`, { method: "DELETE", headers });

const destination = (app: Hono<AppEnv>, cookie: string, account: string) =>
  app.request("/v1/destinations", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Cloud",
      kind: "webdav",
      settings: { account, root: "notes" },
    }),
  });

describe("an access token", () => {
  /** Whoever writes an account can aim the daemon anywhere with a password attached. */
  it("is refused on every account route", async () => {
    const { app, cookie, bearer } = await guarded();
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });
    const authorization = { authorization: bearer };

    const answers = await Promise.all([
      app.request("/v1/account-kinds", { headers: authorization }),
      app.request("/v1/accounts", { headers: authorization }),
      put(app, authorization, "webdav/other", {
        fields: FIELDS,
        secret: SECRET,
      }),
      remove(app, authorization, "webdav/nextcloud"),
    ]);

    for (const answer of answers) {
      expect(answer.status).toBe(403);
      expect(await body(answer)).toEqual({
        error: { code: "session-required" },
      });
    }

    const listed = (await body(
      await app.request("/v1/accounts", { headers: { cookie } }),
    )) as { values: { name: string }[] };
    expect(listed.values.map((each) => each.name)).toEqual(["nextcloud"]);
  });
});

describe("no route answering a secret", () => {
  // Read as text rather than by field, so the secret is caught whatever name it
  // arrives under.
  it("holds for every answer that touches an account", async () => {
    const { app, cookie } = await guarded();
    const headers = { cookie };

    const answers = [
      await put(app, headers, "webdav/nextcloud", {
        fields: FIELDS,
        secret: SECRET,
      }),
      await put(app, headers, "webdav/nextcloud", { fields: FIELDS }),
      await app.request("/v1/accounts", { headers }),
      await app.request("/v1/account-kinds", { headers }),
      await app.request("/v1/destination-kinds", { headers }),
      await destination(app, cookie, "nextcloud"),
      await app.request("/v1/destinations", { headers }),
      await put(app, headers, "webdav/spare", {
        fields: FIELDS,
        secret: SECRET,
      }),
      await remove(app, headers, "webdav/spare"),
    ];

    for (const answer of answers) {
      expect(answer.status).toBeLessThan(300);
      expect(await answer.text()).not.toContain(SECRET);
    }
  });
});

describe("GET /v1/account-kinds", () => {
  it("answers each kind with what its accounts carry besides a secret", async () => {
    const { app, cookie } = await guarded();

    const kinds = (await body(
      await app.request("/v1/account-kinds", { headers: { cookie } }),
    )) as { values: { name: string; accountSchema: object }[] };

    expect(kinds.values.map((each) => each.name).sort()).toEqual([
      "arena",
      "webdav",
    ]);
    expect(
      kinds.values.find((each) => each.name === "webdav")?.accountSchema,
    ).toMatchObject({ required: ["baseUrl", "username"] });
  });
});

describe("GET /v1/accounts", () => {
  it("lists config and stored accounts, marking the config one a stored one shadows", async () => {
    const { app, cookie } = await guarded([
      { kind: "webdav", name: "nextcloud", ...FIELDS, passwordEnv: "UNSET_X" },
      { kind: "arena", name: "mine", secretEnv: "UNSET_Y" },
    ]);
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: { ...FIELDS, username: "bob" },
      secret: SECRET,
    });

    const listed = (await body(
      await app.request("/v1/accounts", { headers: { cookie } }),
    )) as { values: object[] };

    expect(listed.values).toEqual([
      {
        kind: "webdav",
        name: "nextcloud",
        fields: { ...FIELDS, username: "bob" },
        from: "stored",
        shadowed: false,
        secretSet: true,
        changedAt: expect.any(String),
      },
      {
        kind: "arena",
        name: "mine",
        fields: {},
        from: "config",
        shadowed: false,
        secretSet: false,
      },
      {
        kind: "webdav",
        name: "nextcloud",
        fields: FIELDS,
        from: "config",
        shadowed: true,
        secretSet: false,
      },
    ]);
  });
});

describe("PUT /v1/accounts/{kind}/{name}", () => {
  it("stores one and answers it without its secret", async () => {
    const { app, cookie } = await guarded();

    const response = await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      kind: "webdav",
      name: "nextcloud",
      fields: FIELDS,
      from: "stored",
      secretSet: true,
    });
  });

  it("offers the new name to a destination form without a restart", async () => {
    const { app, cookie } = await guarded();
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });

    const kinds = (await body(
      await app.request("/v1/destination-kinds", { headers: { cookie } }),
    )) as {
      values: {
        name: string;
        settingsSchema: {
          properties: { account: { examples?: string[] } };
        };
      }[];
    };

    expect(
      kinds.values.find((each) => each.name === "webdav")?.settingsSchema
        .properties.account.examples,
    ).toEqual(["nextcloud"]);
  });

  it("refuses a kind nothing speaks", async () => {
    const { app, cookie } = await guarded();

    const response = await put(app, { cookie }, "s3/main", {
      fields: {},
      secret: SECRET,
    });

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: { code: "unknown-account-kind", accountKind: "s3" },
    });
  });

  it("refuses fields the kind would not take, naming them", async () => {
    const { app, cookie } = await guarded();

    const response = await put(app, { cookie }, "webdav/nextcloud", {
      fields: { ...FIELDS, passwordFile: "/run/secrets/x" },
      secret: SECRET,
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: {
        code: "invalid-account",
        issues: expect.arrayContaining([
          { path: "/passwordFile", keyword: "secretSource" },
        ]),
      },
    });
  });

  it("refuses to create one without a secret", async () => {
    const { app, cookie } = await guarded();

    const response = await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
    });

    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({
      error: { code: "account-secret-missing" },
    });
  });

  it("refuses a body it cannot read", async () => {
    const { app, cookie } = await guarded();

    expect(
      (await put(app, { cookie }, "webdav/nextcloud", { secret: SECRET }))
        .status,
    ).toBe(400);
    expect(
      (
        await put(app, { cookie }, "webdav/nextcloud", {
          fields: FIELDS,
          secret: "",
        })
      ).status,
    ).toBe(400);
  });
});

describe("DELETE /v1/accounts/{kind}/{name}", () => {
  it("forgets a stored one", async () => {
    const { app, cookie } = await guarded();
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });

    const response = await remove(app, { cookie }, "webdav/nextcloud");

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({});
    const listed = (await body(
      await app.request("/v1/accounts", { headers: { cookie } }),
    )) as { values: unknown[] };
    expect(listed.values).toEqual([]);
  });

  it("answers the config account it no longer shadows", async () => {
    const { app, cookie } = await guarded([
      { kind: "webdav", name: "nextcloud", ...FIELDS, passwordEnv: "UNSET_X" },
    ]);
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });
    // Named, and still answered: the config one takes over, so nothing is stranded.
    await destination(app, cookie, "nextcloud");

    const response = await remove(app, { cookie }, "webdav/nextcloud");

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      revealed: { name: "nextcloud", from: "config", shadowed: false },
    });
  });

  it("refuses while a destination that is not retired names it, and counts them", async () => {
    const { app, cookie } = await guarded();
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });
    await destination(app, cookie, "nextcloud");
    await destination(app, cookie, "nextcloud");

    const response = await remove(app, { cookie }, "webdav/nextcloud");

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      error: { code: "account-in-use", destinations: 2 },
    });
  });

  it("takes one only a retired destination names", async () => {
    const { app, cookie } = await guarded();
    await put(app, { cookie }, "webdav/nextcloud", {
      fields: FIELDS,
      secret: SECRET,
    });
    const created = (await body(
      await destination(app, cookie, "nextcloud"),
    )) as { id: string };
    await app.request(`/v1/destinations/${created.id}/retire`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    });

    expect((await remove(app, { cookie }, "webdav/nextcloud")).status).toBe(
      200,
    );
  });

  it("refuses one that is not stored, a config one among them", async () => {
    const { app, cookie } = await guarded([
      { kind: "webdav", name: "nextcloud", ...FIELDS, passwordEnv: "UNSET_X" },
    ]);

    const response = await remove(app, { cookie }, "webdav/nextcloud");

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: {
        code: "no-such-account",
        accountKind: "webdav",
        name: "nextcloud",
      },
    });
  });
});
