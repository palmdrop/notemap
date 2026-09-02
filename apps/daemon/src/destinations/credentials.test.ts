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

  /**
   * A profile is loaded whatever its address, and refused when it is resolved:
   * one account nothing should be sent to is not a reason for a daemon to stop
   * capturing. Whether the scheme is one this speaks at all is a different
   * question, and that one is the file being wrong.
   */
  it("loads a profile that will be refused when something asks for it", () => {
    const { config } = declare(`
name = "nextcloud"
baseUrl = "http://cloud.example/dav"
username = "alice"
passwordEnv = "A"`);

    expect(config.webdav[0]?.baseUrl).toBe("http://cloud.example/dav");
  });

  it("refuses a scheme a webdav account is never reached over", () => {
    expect(() =>
      declare(`
name = "nextcloud"
baseUrl = "ftp://cloud.example/dav"
username = "alice"
passwordEnv = "A"`),
    ).toThrow(/http or https/);
  });
});

describe("where a password may be sent", () => {
  const resolving = (baseUrl: string): ReturnType<typeof webdavCredentials> =>
    webdavCredentials([{ ...PROFILE, baseUrl, passwordEnv: "NC" }], {
      NC: "an-app-password",
    });

  it("refuses plain HTTP to anywhere the password would cross a network", async () => {
    await expect(resolving("http://cloud.example/dav")("nextcloud")).rejects
      .toThrow(/plain HTTP/);
  });

  /**
   * The ordinary deployment: notemap and Nextcloud as siblings on one compose
   * network, where the address is a service name and there is no loopback and
   * no certificate to be had.
   */
  it("allows plain HTTP to a single-label name, which is a container's", async () => {
    await expect(
      resolving("http://nextcloud:80/remote.php/dav/files/alice")("nextcloud"),
    ).resolves.toMatchObject({ password: "an-app-password" });
  });

  it("allows plain HTTP to loopback and to a private address", async () => {
    for (const baseUrl of [
      "http://localhost:8080/dav",
      "http://127.0.0.1:8080/dav",
      "http://10.1.2.3/dav",
      "http://172.20.0.4/dav",
      "http://192.168.1.5/dav",
      "http://[fd00::1]/dav",
    ]) {
      await expect(resolving(baseUrl)("nextcloud")).resolves.toMatchObject({
        baseUrl,
      });
    }
  });

  it("refuses plain HTTP to an address that only looks private", async () => {
    for (const baseUrl of [
      "http://172.15.0.1/dav",
      "http://172.32.0.1/dav",
      "http://192.169.1.1/dav",
      "http://11.0.0.1/dav",
      "http://[2001:db8::1]/dav",
    ]) {
      await expect(resolving(baseUrl)("nextcloud")).rejects.toThrow(
        /plain HTTP/,
      );
    }
  });

  it("says nothing about the address where the scheme is https", async () => {
    await expect(
      resolving("https://cloud.example/dav")("nextcloud"),
    ).resolves.toMatchObject({ password: "an-app-password" });
  });

  /** The address is answered first, so a secret is never read to be refused. */
  it("refuses before the secret is read", async () => {
    const resolve = webdavCredentials([
      {
        ...PROFILE,
        baseUrl: "http://cloud.example/dav",
        passwordFile: "/nothing/is/here",
      },
    ]);

    await expect(resolve("nextcloud")).rejects.toThrow(/plain HTTP/);
  });
});
