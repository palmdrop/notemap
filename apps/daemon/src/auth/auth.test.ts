import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from ".";
import { createSqliteAuthStore } from "./store";
import type { AuthStore } from "./store/types";
import type { Auth } from "./types";

const START = "2026-08-30T09:00:00.000Z";
const NAME = "anton";
const PASSWORD = "correct horse battery staple";

function frozenClock(start = START): Clock & { set: (value: string) => void } {
  let current = start;
  return {
    now: () => current as Timestamp,
    set: (value) => {
      current = value;
    },
  };
}

const opened: { store: AuthStore; directory: string }[] = [];

function auth(clock: Clock = frozenClock()): { auth: Auth; store: AuthStore } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-auth-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  opened.push({ store, directory });
  return { auth: createAuth(store, { clock }), store };
}

/** Signed in, which is what most of this is about. */
async function signedIn(clock?: Clock) {
  const opened = auth(clock);
  await opened.auth.setPassword(NAME, PASSWORD);

  const session = await opened.auth.login(NAME, PASSWORD);
  if (session === undefined) throw new Error("could not sign in");

  return { ...opened, session };
}

afterEach(async () => {
  for (const each of opened.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

describe("whether the daemon asks for anything", () => {
  it("asks for nothing until a password is set", async () => {
    expect(await auth().auth.requiresCredentials()).toBe(false);
  });

  it("asks once one is", async () => {
    const opened = auth();
    await opened.auth.setPassword(NAME, PASSWORD);

    expect(await opened.auth.requiresCredentials()).toBe(true);
  });

  it("stores the password as a hash and nothing else", async () => {
    const opened = auth();
    await opened.auth.setPassword(NAME, PASSWORD);

    const credential = await opened.store.getCredential();

    expect(credential?.name).toBe(NAME);
    expect(credential?.passwordHash).not.toContain(PASSWORD);
    expect(credential?.passwordHash.startsWith("scrypt")).toBe(true);
  });
});

describe("signing in", () => {
  it("answers a session for the right password", async () => {
    const opened = auth();
    await opened.auth.setPassword(NAME, PASSWORD);

    const session = await opened.auth.login(NAME, PASSWORD);

    expect(session?.token).toBeTruthy();
    expect(session?.expiresAt).toBeTruthy();
  });

  it("answers nothing for the wrong password, or a name nobody has", async () => {
    const opened = auth();
    await opened.auth.setPassword(NAME, PASSWORD);

    expect(await opened.auth.login(NAME, "wrong")).toBeUndefined();
    expect(await opened.auth.login("someone", PASSWORD)).toBeUndefined();
  });

  it("answers nothing at all before a password has been set", async () => {
    expect(await auth().auth.login(NAME, PASSWORD)).toBeUndefined();
  });

  it("takes a second sign-in without ending the first", async () => {
    // A phone and a laptop signed in at once is ordinary.
    const opened = await signedIn();
    const second = await opened.auth.login(NAME, PASSWORD);

    expect(second).toBeDefined();
    expect(
      await opened.auth.authenticate("session", opened.session.token),
    ).toBeDefined();
  });
});

describe("what a request is", () => {
  it("is the session its cookie names", async () => {
    const opened = await signedIn();

    expect(
      await opened.auth.authenticate("session", opened.session.token),
    ).toEqual({ kind: "session", id: opened.session.id });
  });

  it("is the access token its header names, by the name it was minted under", async () => {
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    expect(await opened.auth.authenticate("token", minted.token)).toEqual({
      kind: "token",
      id: minted.id,
      name: "laptop",
    });
  });

  it("is nobody when the two kinds are swapped", async () => {
    // The prefix is what tells them apart, and each verifier insists on it.
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    expect(
      await opened.auth.authenticate("token", opened.session.token),
    ).toBeUndefined();
    expect(
      await opened.auth.authenticate("session", minted.token),
    ).toBeUndefined();
  });

  it("is nobody for something nobody minted", async () => {
    const opened = await signedIn();

    for (const token of ["", "nonsense", "nmp.a.b"]) {
      expect(await opened.auth.authenticate("session", token), token).toBeUndefined();
      expect(await opened.auth.authenticate("token", token), token).toBeUndefined();
    }
  });
});

describe("ending sessions", () => {
  it("ends the one it is given", async () => {
    const opened = await signedIn();

    await opened.auth.endSession(opened.session.id);

    expect(
      await opened.auth.authenticate("session", opened.session.token),
    ).toBeUndefined();
  });

  it("ends every one at once", async () => {
    const opened = await signedIn();
    const second = await opened.auth.login(NAME, PASSWORD);

    await opened.auth.endAllSessions();

    expect(
      await opened.auth.authenticate("session", opened.session.token),
    ).toBeUndefined();
    expect(
      await opened.auth.authenticate("session", second!.token),
    ).toBeUndefined();
  });

  it("leaves access tokens alone when every session ends", async () => {
    // A headless client is not a device someone left on a train.
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    await opened.auth.endAllSessions();

    expect(await opened.auth.authenticate("token", minted.token)).toBeDefined();
  });
});

describe("changing the password", () => {
  it("ends every session that was open", async () => {
    const opened = await signedIn();

    await opened.auth.setPassword(NAME, "a different password");

    expect(
      await opened.auth.authenticate("session", opened.session.token),
    ).toBeUndefined();
  });

  it("takes the new password and refuses the old", async () => {
    const opened = await signedIn();

    await opened.auth.setPassword(NAME, "a different password");

    expect(await opened.auth.login(NAME, "a different password")).toBeDefined();
    expect(await opened.auth.login(NAME, PASSWORD)).toBeUndefined();
  });

  it("leaves access tokens working", async () => {
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    await opened.auth.setPassword(NAME, "a different password");

    expect(await opened.auth.authenticate("token", minted.token)).toBeDefined();
  });
});

describe("access tokens through the service", () => {
  it("shows the token once and never again", async () => {
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    const listed = await opened.auth.listTokens();

    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(minted.token);
  });

  it("stops a revoked token on the next request", async () => {
    const opened = await signedIn();
    const minted = await opened.auth.mintToken("laptop");

    await opened.auth.revokeToken(minted.id);

    expect(await opened.auth.authenticate("token", minted.token)).toBeUndefined();
  });

  it("stops one whose expiry has passed", async () => {
    const clock = frozenClock();
    const opened = await signedIn(clock);
    const minted = await opened.auth.mintToken(
      "ci",
      "2026-09-30T09:00:00.000Z" as Timestamp,
    );

    expect(await opened.auth.authenticate("token", minted.token)).toBeDefined();

    clock.set("2026-10-01T09:00:00.000Z");

    expect(await opened.auth.authenticate("token", minted.token)).toBeUndefined();
  });
});
