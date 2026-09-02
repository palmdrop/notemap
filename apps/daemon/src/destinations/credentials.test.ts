import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "../config/load";
import { plainHttpWarnings, webdavCredentials } from "./credentials";

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
   * A profile is loaded whatever its address: the operator wrote it, and the
   * daemon says what it thinks of it rather than refusing to run. Whether the
   * scheme is one this speaks at all is a different question, and that one is
   * the file being wrong.
   */
  it("loads a profile reached over plain HTTP, which is only warned about", () => {
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

/**
 * Said, and not enforced: whether plain HTTP to an address that is not private
 * is acceptable is the operator's to know. What the daemon owes is that nobody
 * does it without being told.
 */
describe("warning about a password that crosses a network in the clear", () => {
  const warnings = (...urls: readonly string[]): readonly string[] =>
    plainHttpWarnings(
      urls.map((baseUrl, index) => ({
        ...PROFILE,
        name: `profile-${index}`,
        baseUrl,
        passwordEnv: "NC",
      })),
    );

  it("names the account, the host, and what to do about it", () => {
    expect(warnings("http://cloud.example/dav")).toEqual([
      expect.stringMatching(/profile-0 reaches cloud\.example over plain HTTP/),
    ]);
  });

  /**
   * The ordinary deployment: notemap and Nextcloud as siblings on one compose
   * network, where the address is a service name and there is no loopback and
   * no certificate to be had.
   */
  it("says nothing about a single-label name, which is a container's", () => {
    expect(warnings("http://nextcloud:80/remote.php/dav/files/alice")).toEqual(
      [],
    );
  });

  it("says nothing about loopback or a private address", () => {
    expect(
      warnings(
        "http://localhost:8080/dav",
        "http://127.0.0.1:8080/dav",
        "http://10.1.2.3/dav",
        "http://172.20.0.4/dav",
        "http://192.168.1.5/dav",
        "http://[fd00::1]/dav",
        "http://[fe80::1]/dav",
      ),
    ).toEqual([]);
  });

  it("warns about an address that only looks private", () => {
    expect(
      warnings(
        "http://172.15.0.1/dav",
        "http://172.32.0.1/dav",
        "http://192.169.1.1/dav",
        "http://11.0.0.1/dav",
        "http://[2001:db8::1]/dav",
      ),
    ).toHaveLength(5);
  });

  it("says nothing at all where the scheme is https", () => {
    expect(warnings("https://cloud.example/dav")).toEqual([]);
  });
});

describe("resolving a profile that is reached in the clear", () => {
  /** Warned about, not refused: the operator said so, and the delivery is theirs to make. */
  it("hands over the credential anyway", async () => {
    const resolve = webdavCredentials(
      [{ ...PROFILE, baseUrl: "http://cloud.example/dav", passwordEnv: "NC" }],
      { NC: "an-app-password" },
    );

    await expect(resolve("nextcloud")).resolves.toMatchObject({
      baseUrl: "http://cloud.example/dav",
      password: "an-app-password",
    });
  });
});
