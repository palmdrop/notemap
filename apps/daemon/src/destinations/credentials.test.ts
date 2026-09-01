import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "../config/load";
import { webdavCredentials } from "./credentials";

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

const PROFILE = {
  name: "nextcloud",
  baseUrl: "https://cloud.example/remote.php/dav/files/alice",
  username: "alice",
};

describe("resolving a profile", () => {
  it("reads the secret from a file, dropping the newline it was written with", async () => {
    const path = await secretFile("an-app-password\n");
    const resolve = webdavCredentials([{ ...PROFILE, passwordFile: path }], {});

    await expect(resolve("nextcloud")).resolves.toEqual({
      baseUrl: PROFILE.baseUrl,
      username: "alice",
      password: "an-app-password",
    });
  });

  /** A password may legitimately end in a space, so only the line ending goes. */
  it("keeps the whitespace a password actually carries", async () => {
    const path = await secretFile("  spaced  \n");
    const resolve = webdavCredentials([{ ...PROFILE, passwordFile: path }], {});

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "  spaced  ",
    });
  });

  it("reads the secret from the environment where that is what was named", async () => {
    const resolve = webdavCredentials([{ ...PROFILE, passwordEnv: "NC" }], {
      NC: "from-the-environment",
    });

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      password: "from-the-environment",
    });
  });

  /** Rotation is writing the file: a secret read once at startup would outlive it. */
  it("reads the file again on every resolution", async () => {
    const path = await secretFile("first\n");
    const resolve = webdavCredentials([{ ...PROFILE, passwordFile: path }], {});

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
  it("names the profile nothing declared", async () => {
    const resolve = webdavCredentials([], {});

    await expect(resolve("nextcloud")).rejects.toThrow(/nextcloud/);
  });

  it("names the file it could not read", async () => {
    const resolve = webdavCredentials(
      [{ ...PROFILE, passwordFile: "/nowhere/at/all" }],
      {},
    );

    await expect(resolve("nextcloud")).rejects.toThrow(/\/nowhere\/at\/all/);
  });

  it("refuses an empty secret rather than presenting one", async () => {
    const path = await secretFile("\n");
    const resolve = webdavCredentials([{ ...PROFILE, passwordFile: path }], {});

    await expect(resolve("nextcloud")).rejects.toThrow(/empty/);

    const unset = webdavCredentials([{ ...PROFILE, passwordEnv: "NC" }], {});
    await expect(unset("nextcloud")).rejects.toThrow(/no password/);
  });
});

describe("the config a profile is declared in", () => {
  const declare = (body: string): ReturnType<typeof parseConfig> =>
    parseConfig(`[[webdav]]\n${body}\n`, "config.toml");

  it("takes a profile naming a file", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "https://cloud.example/remote.php/dav/files/alice/"
username = "alice"
passwordFile = "/run/secrets/nextcloud"`);

    expect(config.webdav).toEqual([
      {
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

  it("refuses a profile that names neither, and one that names both", () => {
    const body = `
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"`;

    expect(() => declare(body)).toThrow(/exactly one/);
    expect(() =>
      declare(`${body}\npasswordFile = "/a"\npasswordEnv = "B"`),
    ).toThrow(/exactly one/);
  });

  it("refuses two profiles under one name, since a destination names one", () => {
    const one = `
name = "nextcloud"
baseUrl = "https://cloud.example/dav"
username = "alice"
passwordEnv = "A"`;

    expect(() =>
      parseConfig(`[[webdav]]${one}\n[[webdav]]${one}\n`, "c"),
    ).toThrow(/declared twice/);
  });

  it("refuses plain HTTP to anywhere the password would cross a network", () => {
    expect(() =>
      declare(`
name = "nextcloud"
baseUrl = "http://cloud.example/dav"
username = "alice"
passwordEnv = "A"`),
    ).toThrow(/in the clear/);
  });

  /** A DAV server on the same machine is the development case, and nothing is crossed. */
  it("allows plain HTTP to loopback", () => {
    const { config } = declare(`
name = "local"
baseUrl = "http://localhost:8080/dav"
username = "alice"
passwordEnv = "A"`);

    expect(config.webdav[0]?.baseUrl).toBe("http://localhost:8080/dav");
  });
});
