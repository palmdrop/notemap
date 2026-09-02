import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "../config/load";
import { accountsFor } from "./credentials";

const directories: string[] = [];

afterEach(() => {
  for (const each of directories.splice(0)) {
    rmSync(each, { recursive: true, force: true });
  }
});

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
    const resolve = accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toEqual({
      baseUrl: ACCOUNT.baseUrl,
      username: "alice",
      password: "an-app-password",
    });
  });

  /** A password may legitimately end in a space, so only the line ending goes. */
  it("keeps the whitespace a password actually carries", async () => {
    const path = await secretFile("  spaced  \n");
    const resolve = accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "  spaced  ",
    });
  });

  it("reads the secret from the environment where that is what was named", async () => {
    const resolve = accountsFor(WEBDAV, [{ ...ACCOUNT, passwordEnv: "NC" }], {
      NC: "from-the-environment",
    });

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "from-the-environment",
    });
  });

  /** Rotation is writing the file: a secret read once at startup would outlive it. */
  it("reads the file again on every resolution", async () => {
    const path = await secretFile("first\n");
    const resolve = accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "first",
    });

    await writeFile(path, "second\n");
    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "second",
    });
  });
});

describe("a credential that will not resolve", () => {
  it("names the account nothing declared", async () => {
    const resolve = accountsFor(WEBDAV, [], {});

    await expect(resolve("nextcloud")).rejects.toThrow(/nextcloud/);
  });

  it("names the file it could not read", async () => {
    const resolve = accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: "/nowhere/at/all" }],
      {},
    );

    await expect(resolve("nextcloud")).rejects.toThrow(/\/nowhere\/at\/all/);
  });

  it("refuses an empty secret rather than presenting one", async () => {
    const path = await secretFile("\n");
    const resolve = accountsFor(
      WEBDAV,
      [{ ...ACCOUNT, passwordFile: path }],
      {},
    );

    await expect(resolve("nextcloud")).rejects.toThrow(/empty/);

    const unset = accountsFor(WEBDAV, [{ ...ACCOUNT, passwordEnv: "NC" }], {});
    await expect(unset("nextcloud")).rejects.toThrow(/no password/);
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

    expect(config.accounts).toEqual([
      {
        kind: "webdav",
        name: "nextcloud",
        // The trailing slash goes, so a segment is always appended the same way.
        baseUrl: "https://cloud.example/remote.php/dav/files/alice",
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

  it("refuses an account that names neither, and one that names both", () => {
    const body = `
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"`;

    expect(() => declare(body)).toThrow(/exactly one/);
    expect(() =>
      declare(`${body}\npasswordFile = "/a"\npasswordEnv = "B"`),
    ).toThrow(/exactly one/);
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

    expect(config.accounts[0]?.baseUrl).toBe("http://cloud.example/dav");
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

    expect(config.accounts[0]?.passwordFile).toBe(
      join(homedir(), ".config/notemap/nextcloud"),
    );
  });

  it("refuses a scheme an account is never reached over", () => {
    expect(() =>
      declare(`
name = "nextcloud"
baseUrl = "ftp://cloud.example/dav"
username = "alice"
passwordEnv = "A"`),
    ).toThrow(/http or https/);
  });
});
