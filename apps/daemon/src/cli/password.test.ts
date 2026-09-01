import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CREDENTIALS_NAME } from "../auth/config";
import { createSqliteAuthStore } from "../auth/store";
import { createAuth } from "../auth";
import { systemClock } from "../ports";
import { setPassword } from "./password";
import { cleanup, configured, piped, said } from "./testing";

const PASSWORD = "correct horse battery staple";

/** What the daemon would see, opened after the command has closed its own. */
const opened = async (file: string) => {
  const store = createSqliteAuthStore({ file });
  return { auth: createAuth(store, { clock: systemClock }), store };
};

afterEach(cleanup);

describe("setting the password", () => {
  it("takes one piped in, and the daemon then asks for it", async () => {
    const { argv, auth: file } = configured();
    const heard = said();

    try {
      await setPassword(argv, piped(`${PASSWORD}\n`));
    } finally {
      heard.restore();
    }

    const { auth, store } = await opened(file);
    try {
      expect(await auth.requiresCredentials()).toBe(true);
      expect(
        await auth.login(DEFAULT_CREDENTIALS_NAME, PASSWORD),
      ).toBeDefined();
    } finally {
      await store.close();
    }
  });

  it("takes the name it is given", async () => {
    const { argv, auth: file } = configured();
    const heard = said();

    try {
      await setPassword([...argv, "--name", "anton"], piped(PASSWORD));
    } finally {
      heard.restore();
    }

    const { auth, store } = await opened(file);
    try {
      expect(await auth.login("anton", PASSWORD)).toBeDefined();
      expect(
        await auth.login(DEFAULT_CREDENTIALS_NAME, PASSWORD),
      ).toBeUndefined();
    } finally {
      await store.close();
    }
  });

  /** The command is how a person recovers a daemon, so it must replace as well as set. */
  it("replaces one already set, and ends the sessions it had", async () => {
    const { argv, auth: file } = configured();

    const before = await opened(file);
    await before.auth.setPassword(DEFAULT_CREDENTIALS_NAME, "the password before this");
    const session = await before.auth.login(DEFAULT_CREDENTIALS_NAME, "the password before this");
    await before.store.close();

    expect(session).toBeDefined();

    const heard = said();
    try {
      await setPassword(argv, piped(PASSWORD));
    } finally {
      heard.restore();
    }

    const { auth, store } = await opened(file);
    try {
      expect(await auth.login(DEFAULT_CREDENTIALS_NAME, "the password before this")).toBeUndefined();
      expect(await auth.login(DEFAULT_CREDENTIALS_NAME, PASSWORD)).toBeDefined();
      expect(
        await auth.authenticate("session", session?.token ?? ""),
      ).toBeUndefined();
    } finally {
      await store.close();
    }
  });

  it("refuses a password of nothing, rather than setting one", async () => {
    const { argv, auth: file } = configured();
    const heard = said();

    try {
      await expect(setPassword(argv, piped("\n"))).rejects.toThrow(/not one/);
    } finally {
      heard.restore();
    }

    const { auth, store } = await opened(file);
    try {
      expect(await auth.requiresCredentials()).toBe(false);
    } finally {
      await store.close();
    }
  });

  it("says what it did, naming who it did it for", async () => {
    const { argv } = configured();
    const heard = said();

    try {
      await setPassword([...argv, "--name", "anton"], piped(PASSWORD));
    } finally {
      heard.restore();
    }

    expect(heard.out.join("\n")).toContain("anton");
    expect(heard.out.join("\n")).toContain("every session that was open");
  });
});
