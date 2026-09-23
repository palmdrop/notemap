import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAjvSchemaValidator } from "@notemap/schema-ajv";

import type { JsonObject, Timestamp } from "@notemap/core";

import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import { parseConfig, type Account } from "../config/load";
import { ACCOUNT_SCHEMAS, systemClock } from "../ports";
import { createAccounts } from ".";
import * as check from "./check";

const validator = createAjvSchemaValidator();

const refuseUnusableAccounts = (accounts: readonly Account[]) =>
  check.refuseUnusableAccounts(ACCOUNT_SCHEMAS, accounts, validator);

const accountIssues = (kind: string, fields: JsonObject) =>
  check.accountIssues(ACCOUNT_SCHEMAS[kind] ?? {}, fields, validator);

const openAccounts = (
  config: Omit<
    Parameters<typeof createAccounts>[0],
    "kinds" | "schemas" | "clock"
  >,
) =>
  createAccounts({
    kinds: ACCOUNT_SCHEMAS,
    schemas: validator,
    clock: systemClock,
    ...config,
  });

const directories: string[] = [];
const stores: AuthStore[] = [];

afterEach(async () => {
  for (const each of stores.splice(0)) await each.close();
  for (const each of directories.splice(0)) {
    rmSync(each, { recursive: true, force: true });
  }
});

function authStore(): AuthStore {
  const directory = mkdtempSync(join(tmpdir(), "notemap-accounts-"));
  directories.push(directory);

  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });
  stores.push(store);
  return store;
}

async function accountsFor(
  kind: string,
  config: readonly Account[],
  env: NodeJS.ProcessEnv,
) {
  const accounts = await openAccounts({ config, env });
  return (name: string) => accounts.resolve(kind, name);
}

function secretFile(contents: string): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-credential-"));
  directories.push(directory);

  const path = join(directory, "password");
  return writeFile(path, contents).then(() => path);
}

const WEBDAV = "webdav";

const ACCOUNT = {
  kind: WEBDAV,
  name: "nextcloud",
  baseUrl: "https://cloud.example/remote.php/dav/files/alice",
  username: "alice",
};

describe("resolving an account", () => {
  it("reads the secret from a file, dropping the newline it was written with", async () => {
    const path = await secretFile("an-app-password\n");
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toEqual({
      ...ACCOUNT,
      passwordFile: path,
      secret: "an-app-password",
    });
  });

  /** A password may legitimately end in a space, so only the line ending goes. */
  it("keeps the whitespace a password actually carries", async () => {
    const path = await secretFile("  spaced  \n");
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      secret: "  spaced  ",
    });
  });

  it("reads the secret from the environment where that is what was named", async () => {
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordEnv: "NC" }],
      {
        NC: "from-the-environment",
      },
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      secret: "from-the-environment",
    });
  });

  /** Rotation is writing the file: a secret read once at startup would outlive it. */
  it("reads the file again on every resolution", async () => {
    const path = await secretFile("first\n");
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      secret: "first",
    });

    await writeFile(path, "second\n");
    await expect(resolve("nextcloud")).resolves.toMatchObject({
      secret: "second",
    });
  });
});

describe("a credential that will not resolve", () => {
  it("names the account nothing declared", async () => {
    const resolve = await accountsFor(WEBDAV, [], {});

    await expect(resolve("nextcloud")).rejects.toThrow(/nextcloud/);
  });

  it("names the file it could not read", async () => {
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: "/nowhere/at/all" }],
      {},
    );

    await expect(resolve("nextcloud")).rejects.toThrow(/\/nowhere\/at\/all/);
  });

  it("refuses an empty secret rather than presenting one", async () => {
    const path = await secretFile("\n");
    const resolve = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).rejects.toThrow(/empty/);

    const unset = await accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordEnv: "NC" }],
      {},
    );
    await expect(unset("nextcloud")).rejects.toThrow(/no secret/);
  });
});

describe("an account the daemon holds", () => {
  const STORED = {
    kind: WEBDAV,
    name: "nextcloud",
    fields: {
      baseUrl: "https://other.example/remote.php/dav/files/bob",
      username: "bob",
    },
    secret: "held-secret",
    changedAt: "2026-09-23T09:00:00.000Z" as Timestamp,
  };

  it("resolves from the store, secret and all", async () => {
    const store = authStore();
    await store.putAccount(STORED);
    const accounts = await openAccounts({ store, config: [], env: {} });

    await expect(accounts.resolve(WEBDAV, "nextcloud")).resolves.toEqual({
      kind: WEBDAV,
      name: "nextcloud",
      ...STORED.fields,
      secret: "held-secret",
    });
  });

  /** Merging two half-accounts is undebuggable, so nothing of the config one survives. */
  it("replaces a config account of the same kind and name entirely", async () => {
    const store = authStore();
    await store.putAccount({
      ...STORED,
      fields: { baseUrl: "https://b.example/", username: "bob" },
    });
    const accounts = await openAccounts({
      store,
      config: [{ ...ACCOUNT, passwordEnv: "NC" }],
      env: { NC: "config-secret" },
    });

    const held = await accounts.resolve(WEBDAV, "nextcloud");

    expect(held).toEqual({
      kind: WEBDAV,
      name: "nextcloud",
      baseUrl: "https://b.example/",
      username: "bob",
      secret: "held-secret",
    });
    expect(accounts.list()).toEqual([
      {
        kind: WEBDAV,
        name: "nextcloud",
        fields: { baseUrl: "https://b.example/", username: "bob" },
        from: "stored",
        changedAt: STORED.changedAt,
      },
    ]);
    expect(accounts.shadowed()).toEqual([
      {
        kind: WEBDAV,
        name: "nextcloud",
        fields: { baseUrl: ACCOUNT.baseUrl, username: ACCOUNT.username },
        from: "config",
      },
    ]);
  });

  it("leaves a config account of another name, or another kind, in use", async () => {
    const store = authStore();
    await store.putAccount(STORED);
    const accounts = await openAccounts({
      store,
      config: [
        { ...ACCOUNT, name: "work", passwordEnv: "A" },
        { kind: "arena", name: "nextcloud", secretEnv: "B" },
      ],
      env: {},
    });

    expect(accounts.names(WEBDAV)).toEqual(["nextcloud", "work"]);
    expect(accounts.names("arena")).toEqual(["nextcloud"]);
    expect(accounts.shadowed()).toEqual([]);
  });

  it("lists nothing that carries a secret, or where one is read from", async () => {
    const store = authStore();
    await store.putAccount(STORED);
    const accounts = await openAccounts({
      store,
      config: [{ ...ACCOUNT, name: "work", passwordFile: "/run/secrets/work" }],
      env: {},
    });

    const listed = JSON.stringify(accounts.list());
    expect(listed).not.toContain("held-secret");
    expect(listed).not.toContain("passwordFile");
    expect(listed).not.toContain("/run/secrets/work");
  });

  /** A replaced secret lands on the next delivery, not the next restart. */
  it("reads the store again on every resolution", async () => {
    const store = authStore();
    await store.putAccount(STORED);
    const accounts = await openAccounts({ store, config: [], env: {} });

    await store.putAccount({ ...STORED, secret: "replaced" });

    await expect(accounts.resolve(WEBDAV, "nextcloud")).resolves.toMatchObject({
      secret: "replaced",
    });
  });
});

describe("the config an account is declared in", () => {
  const declare = (body: string): ReturnType<typeof parseConfig> =>
    parseConfig(`[[accounts]]\nkind = "webdav"\n${body}\n`, "config.toml");

  it("takes an account naming a file", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "https://cloud.example/remote.php/dav/files/alice/"
username = "alice"
passwordFile = "/run/secrets/nextcloud"`);

    // Carried as it was written: what a base URL may end in is the webdav
    // kind's business, and this file no longer knows an address from a name.
    expect(config.accounts).toEqual([
      {
        kind: "webdav",
        name: "nextcloud",
        baseUrl: "https://cloud.example/remote.php/dav/files/alice/",
        username: "alice",
        passwordFile: "/run/secrets/nextcloud",
      },
    ]);
  });

  it("refuses an inline password, naming what to use instead", () => {
    expect(() =>
      declare(`
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"
password = "hunter2"`),
    ).toThrow(/passwordFile or passwordEnv/);
  });

  it("refuses an account that names no secret source, and one that names two", () => {
    const body = `
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"`;

    expect(() => declare(body)).toThrow(
      /exactly one key ending in File or Env/,
    );
    expect(() =>
      declare(`${body}\npasswordFile = "/a"\npasswordEnv = "B"`),
    ).toThrow(/exactly one key ending in File or Env/);
  });

  it("refuses two accounts of one kind under one name, since a destination names one", () => {
    const one = `
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"
passwordEnv = "A"`;

    expect(() =>
      parseConfig(
        `[[accounts]]\nkind = "webdav"${one}\n[[accounts]]\nkind = "webdav"${one}\n`,
        "c",
      ),
    ).toThrow(/declared twice/);
  });

  /**
   * An account is loaded whatever its address: the operator wrote it, and the
   * adapter says what it thinks of it rather than the daemon refusing to run.
   * Whether the scheme is one anything speaks is a different question, and that
   * one is the file being wrong.
   */
  it("loads an account reached over plain HTTP, which is only warned about", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "http://cloud.example/dav"
username = "alice"
passwordEnv = "A"`);

    expect(config.accounts[0]?.["baseUrl"]).toBe("http://cloud.example/dav");
  });

  /** Two kinds may each have a `main`; a destination of one never means the other's. */
  it("takes one name under two kinds, which are two accounts", () => {
    const { config } = parseConfig(
      `[[accounts]]\nkind = "webdav"\nname = "main"\nbaseUrl = "https://a.example/dav"\nusername = "alice"\npasswordEnv = "A"\n` +
        `[[accounts]]\nkind = "s3"\nname = "main"\nbaseUrl = "https://b.example/"\nusername = "alice"\npasswordEnv = "B"\n`,
      "c",
    );

    expect(config.accounts.map((each) => each.kind)).toEqual(["webdav", "s3"]);
  });

  /** Every other path in this file expands it, and a secret is not the exception. */
  it("reads `~` in a password file as the home directory", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"
passwordFile = "~/.config/notemap/nextcloud"`);

    expect(config.accounts[0]?.["passwordFile"]).toBe(
      join(homedir(), ".config/notemap/nextcloud"),
    );
  });

  /**
   * Loaded here and refused by the kind: a scheme is a statement about Basic
   * auth over a URL, and means nothing to a kind that has no URL at all.
   */
  it("loads an account whose scheme its kind will refuse", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "ftp://cloud.example/dav"
username = "alice"
passwordEnv = "A"`);

    expect(config.accounts[0]?.["baseUrl"]).toBe("ftp://cloud.example/dav");
    expect(() => refuseUnusableAccounts(config.accounts)).toThrow(
      /webdav account/,
    );
  });
});

/**
 * Each kind says what its accounts must carry, and the daemon asks when it
 * starts rather than at the first delivery hours later.
 */
describe("checking an account against its kind", () => {
  const check = (body: string) =>
    refuseUnusableAccounts(parseConfig(body, "config.toml").config.accounts);

  it("takes a webdav account carrying an address and a username", () => {
    expect(() =>
      check(
        `[[accounts]]\nkind = "webdav"\nname = "nextcloud"\nbaseUrl = "https://cloud.example/dav"\nusername = "alice"\npasswordEnv = "A"\n`,
      ),
    ).not.toThrow();
  });

  /** None of webdav's three fields fits are.na, and two of them are required. */
  it("takes an arena account carrying nothing but a secret", () => {
    expect(() =>
      check(
        `[[accounts]]\nkind = "arena"\nname = "mine"\nsecretEnv = "ARENA"\n`,
      ),
    ).not.toThrow();
  });

  it("refuses an arena account carrying a webdav account's fields", () => {
    expect(() =>
      check(
        `[[accounts]]\nkind = "arena"\nname = "mine"\nsecretEnv = "ARENA"\nusername = "alice"\n`,
      ),
    ).toThrow(/arena account mine/);
  });

  it("refuses a webdav account carrying no username", () => {
    expect(() =>
      check(
        `[[accounts]]\nkind = "webdav"\nname = "nextcloud"\nbaseUrl = "https://cloud.example/dav"\npasswordEnv = "A"\n`,
      ),
    ).toThrow(/webdav account nextcloud/);
  });

  /** An account naming one is a typo; starting would leave a destination that can never deliver. */
  it("refuses an account of a kind nothing speaks", () => {
    expect(() =>
      check(`[[accounts]]\nkind = "s3"\nname = "main"\nsecretEnv = "A"\n`),
    ).toThrow(/nothing speaks/);
  });
});

/**
 * A stored account holds its secret, so its fields are checked against the
 * same schema a config account is, with nowhere to say where a secret is read.
 */
describe("checking a stored account against its kind", () => {
  it("takes a webdav account carrying an address and a username", () => {
    expect(
      accountIssues("webdav", {
        baseUrl: "https://cloud.example/dav",
        username: "alice",
      }),
    ).toEqual([]);
  });

  it("takes an arena account carrying nothing", () => {
    expect(accountIssues("arena", {})).toEqual([]);
  });

  it("refuses a webdav account missing a username", () => {
    expect(
      accountIssues("webdav", { baseUrl: "https://cloud.example/dav" }),
    ).not.toEqual([]);
  });

  it("refuses an arena account carrying a field it has no use for", () => {
    expect(accountIssues("arena", { username: "alice" })).not.toEqual([]);
  });

  it("refuses a key saying where a secret is read from, for every kind", () => {
    expect(
      accountIssues("webdav", {
        baseUrl: "https://cloud.example/dav",
        username: "alice",
        passwordFile: "/run/secrets/nextcloud",
      }),
    ).toContainEqual({ path: "/passwordFile", keyword: "secretSource" });
    expect(accountIssues("arena", { secretEnv: "ARENA" })).toContainEqual({
      path: "/secretEnv",
      keyword: "secretSource",
    });
  });
});

describe("writing an account", () => {
  const FIELDS = {
    baseUrl: "https://cloud.example/remote.php/dav/files/alice",
    username: "alice",
  };

  it("stores one, offers its name at once, and resolves it", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [],
      env: {},
    });

    const put = await accounts.put({
      kind: WEBDAV,
      name: "nextcloud",
      fields: FIELDS,
      secret: "app-password",
    });

    expect(put).toMatchObject({ ok: true, value: { from: "stored" } });
    expect(accounts.names(WEBDAV)).toEqual(["nextcloud"]);
    await expect(accounts.resolve(WEBDAV, "nextcloud")).resolves.toMatchObject({
      secret: "app-password",
      username: "alice",
    });
  });

  it("keeps the secret it holds when a replacement brings none", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [],
      env: {},
    });
    await accounts.put({
      kind: WEBDAV,
      name: "nextcloud",
      fields: FIELDS,
      secret: "app-password",
    });

    await accounts.put({
      kind: WEBDAV,
      name: "nextcloud",
      fields: { ...FIELDS, username: "bob" },
    });

    await expect(accounts.resolve(WEBDAV, "nextcloud")).resolves.toMatchObject({
      secret: "app-password",
      username: "bob",
    });
  });

  /** A config account's secret is not copied across: it lives in a file the daemon does not own. */
  it("refuses a new account with no secret, even over a config one", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [{ ...ACCOUNT, passwordEnv: "NC" }],
      env: { NC: "config-secret" },
    });

    expect(
      await accounts.put({ kind: WEBDAV, name: "nextcloud", fields: FIELDS }),
    ).toEqual({ ok: false, refusal: { kind: "account-secret-missing" } });
  });

  it("refuses a kind nothing speaks, and fields its kind would not take", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [],
      env: {},
    });

    expect(
      await accounts.put({ kind: "s3", name: "x", fields: {}, secret: "s" }),
    ).toEqual({
      ok: false,
      refusal: { kind: "unknown-account-kind", accountKind: "s3" },
    });
    expect(
      await accounts.put({
        kind: WEBDAV,
        name: "x",
        fields: { ...FIELDS, passwordFile: "/run/a" },
        secret: "s",
      }),
    ).toMatchObject({ ok: false, refusal: { kind: "invalid-account" } });
  });

  it("reveals the config account a removed one shadowed", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [{ ...ACCOUNT, passwordEnv: "NC" }],
      env: { NC: "config-secret" },
    });
    await accounts.put({
      kind: WEBDAV,
      name: "nextcloud",
      fields: FIELDS,
      secret: "held",
    });

    const removed = await accounts.remove(WEBDAV, "nextcloud");

    expect(removed).toMatchObject({
      ok: true,
      value: { revealed: { from: "config", name: "nextcloud" } },
    });
    expect(accounts.shadowed()).toEqual([]);
    await expect(accounts.resolve(WEBDAV, "nextcloud")).resolves.toMatchObject({
      secret: "config-secret",
    });
  });

  it("refuses to remove what is not stored, a config account among them", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [{ ...ACCOUNT, passwordEnv: "NC" }],
      env: {},
    });

    expect(await accounts.remove(WEBDAV, "nextcloud")).toMatchObject({
      ok: false,
      refusal: { kind: "no-such-account" },
    });
  });
});

describe("whether a secret is set", () => {
  it("is so for a stored account, and for a config one whose source can be read", async () => {
    const accounts = await openAccounts({
      store: authStore(),
      config: [
        { ...ACCOUNT, passwordEnv: "NC" },
        { ...ACCOUNT, name: "unset", passwordEnv: "NOTHING" },
      ],
      env: { NC: "config-secret" },
    });
    await accounts.put({
      kind: "arena",
      name: "mine",
      fields: {},
      secret: "token",
    });

    const set = Object.fromEntries(
      await Promise.all(
        accounts
          .list()
          .map(async (each) => [each.name, await accounts.secretSet(each)]),
      ),
    );

    expect(set).toEqual({ mine: true, nextcloud: true, unset: false });
  });
});
