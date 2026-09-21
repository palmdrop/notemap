import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuth } from ".";
import { capturedLog } from "../log/testing";
import { DEFAULT_CREDENTIALS_NAME } from "./config";
import {
  passwordFromEnvironment,
  provisionCredential,
  PASSWORD,
  PASSWORD_FILE,
} from "./provision";
import { createSqliteAuthStore } from "./store";
import type { AuthStore } from "./store/types";
import type { Auth } from "./types";

const GIVEN = "correct horse battery staple";

const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

const opened: { store: AuthStore; directory: string }[] = [];
const directories: string[] = [];

function auth(): Auth {
  const directory = mkdtempSync(join(tmpdir(), "notemap-provision-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  opened.push({ store, directory });
  return createAuth(store, { clock: systemClock });
}

/** A file holding a secret, the way a mounted one arrives. */
function secret(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "notemap-secret-"));
  const file = join(directory, "password");

  directories.push(directory);
  writeFileSync(file, contents);

  return file;
}

afterEach(async () => {
  vi.restoreAllMocks();

  for (const each of opened.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("where the password may arrive from", () => {
  it("is the variable itself", () => {
    expect(passwordFromEnvironment({ [PASSWORD]: GIVEN })).toEqual({
      password: GIVEN,
      variable: PASSWORD,
    });
  });

  it("or a file, which is what a secret is mounted as", () => {
    expect(passwordFromEnvironment({ [PASSWORD_FILE]: secret(GIVEN) })).toEqual(
      { password: GIVEN, variable: PASSWORD_FILE },
    );
  });

  /**
   * `echo secret > file` leaves one, and a newline is a character a password
   * may not carry — so keeping it would refuse every secret written that way.
   */
  it("takes the newline off the end of a file, and only the end", () => {
    expect(
      passwordFromEnvironment({ [PASSWORD_FILE]: secret(`${GIVEN}\n`) }),
    ).toHaveProperty("password", GIVEN);
    expect(
      passwordFromEnvironment({ [PASSWORD_FILE]: secret(`${GIVEN}\r\n`) }),
    ).toHaveProperty("password", GIVEN);
    expect(
      passwordFromEnvironment({ [PASSWORD_FILE]: secret(` ${GIVEN} \n`) }),
    ).toHaveProperty("password", ` ${GIVEN} `);
  });

  it("is nothing at all where neither is set", () => {
    expect(passwordFromEnvironment({})).toBeUndefined();
  });

  it("is refused where both are set, rather than one quietly winning", () => {
    expect(() =>
      passwordFromEnvironment({
        [PASSWORD]: GIVEN,
        [PASSWORD_FILE]: secret(GIVEN),
      }),
    ).toThrow(/are both set/);
  });

  it("is refused where the file it names is not there", () => {
    expect(() =>
      passwordFromEnvironment({ [PASSWORD_FILE]: "/no/such/secret" }),
    ).toThrow(/could not be read/);
  });
});

describe("a daemon starting with a password in its environment", () => {
  it("arrives with the door shut", async () => {
    const it_ = auth();

    await provisionCredential(it_, { [PASSWORD]: GIVEN });

    expect(await it_.requiresCredentials()).toBe(true);
    expect(await it_.login(DEFAULT_CREDENTIALS_NAME, GIVEN)).toBeDefined();
  });

  it("leaves a password that is already set alone, and says so", async () => {
    const it_ = auth();
    await it_.setPassword("someone", "a password of their own");

    const { log, lines } = capturedLog();
    await provisionCredential(it_, { [PASSWORD]: GIVEN }, log);

    // The database is what a person changed; a restart must not undo it.
    expect(await it_.login("someone", "a password of their own")).toBeDefined();
    expect(await it_.login(DEFAULT_CREDENTIALS_NAME, GIVEN)).toBeUndefined();
    expect(lines()).toEqual([
      expect.stringMatching(new RegExp(`^WARN .*variable=${PASSWORD}`)),
    ]);
  });

  it("does not start where the password cannot be used", async () => {
    await expect(
      provisionCredential(auth(), { [PASSWORD]: "too short" }),
    ).rejects.toThrow(/shorter than 12 characters/);

    await expect(
      provisionCredential(auth(), { [PASSWORD]: "" }),
    ).rejects.toThrow(/is empty/);
  });

  it("leaves a daemon with neither variable open, as before", async () => {
    const it_ = auth();

    await provisionCredential(it_, {});

    expect(await it_.requiresCredentials()).toBe(false);
  });
});
