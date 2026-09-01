import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import type { SessionId, TokenId } from "../types";
import { createSqliteAuthStore } from ".";
import type { AuthStore } from "./types";

const at = (value: string) => value as Timestamp;

const opened: { store: AuthStore; directory: string }[] = [];

/** A file rather than `:memory:`, which forfeits the second read connection. */
function store(): AuthStore {
  const directory = mkdtempSync(join(tmpdir(), "notemap-auth-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  opened.push({ store, directory });
  return store;
}

afterEach(async () => {
  for (const each of opened.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

const credential = {
  name: "anton",
  passwordHash: "scrypt$32$1024$8$1$c2FsdA$a2V5",
  changedAt: at("2026-08-29T09:00:00.000Z"),
};

const session = {
  id: "session-1" as SessionId,
  secretHash: "hash-1",
  createdAt: at("2026-08-29T09:00:00.000Z"),
  expiresAt: at("2026-09-08T09:00:00.000Z"),
};

const token = {
  id: "token-1" as TokenId,
  name: "laptop",
  secretHash: "hash-2",
  createdAt: at("2026-08-29T09:00:00.000Z"),
};

describe("the database file", () => {
  /**
   * It holds the password hash, so it is the owner's alone. SQLite gives the
   * `-wal` and `-shm` siblings whatever mode the database file has, which is
   * why restricting it has to happen before the first write rather than after.
   */
  it("is left readable only by the user that owns it", () => {
    const directory = mkdtempSync(join(tmpdir(), "notemap-auth-"));
    const file = join(directory, "auth.db");

    opened.push({ store: createSqliteAuthStore({ file }), directory });

    const written = readdirSync(directory);
    // Named, so the loop below cannot pass by finding nothing to look at.
    expect(written.sort()).toEqual(["auth.db", "auth.db-shm", "auth.db-wal"]);

    for (const name of written) {
      const mode = statSync(join(directory, name)).mode & 0o777;
      expect(mode.toString(8), name).toBe("600");
    }
  });
});

describe("the credential", () => {
  it("is absent until one is set", async () => {
    expect(await store().getCredential()).toBeUndefined();
  });

  it("round-trips", async () => {
    const auth = store();
    await auth.setCredential(credential);

    expect(await auth.getCredential()).toEqual(credential);
  });

  it("replaces the one before it rather than adding a second", async () => {
    const auth = store();
    await auth.setCredential(credential);
    await auth.setCredential({
      ...credential,
      passwordHash: "a newer hash",
      changedAt: at("2026-08-30T09:00:00.000Z"),
    });

    expect(await auth.getCredential()).toMatchObject({
      passwordHash: "a newer hash",
      changedAt: "2026-08-30T09:00:00.000Z",
    });
  });
});

describe("sessions", () => {
  it("round-trips one and forgets it when deleted", async () => {
    const auth = store();
    await auth.addSession(session);

    expect(await auth.getSession(session.id)).toEqual(session);

    await auth.deleteSession(session.id);
    expect(await auth.getSession(session.id)).toBeUndefined();
  });

  it("answers for a session that was never there", async () => {
    expect(await store().getSession("nobody" as SessionId)).toBeUndefined();
  });

  it("ends every session at once", async () => {
    const auth = store();
    await auth.addSession(session);
    await auth.addSession({ ...session, id: "session-2" as SessionId });

    await auth.deleteAllSessions();

    expect(await auth.getSession(session.id)).toBeUndefined();
    expect(await auth.getSession("session-2" as SessionId)).toBeUndefined();
  });
});

describe("tokens", () => {
  it("round-trips one that never expires", async () => {
    const auth = store();
    await auth.addToken(token);

    expect(await auth.getToken(token.id)).toEqual(token);
  });

  it("carries an expiry and a last use where it has them", async () => {
    const auth = store();
    const full = {
      ...token,
      expiresAt: at("2026-09-29T09:00:00.000Z"),
      lastUsedAt: at("2026-08-30T09:00:00.000Z"),
    };
    await auth.addToken(full);

    expect(await auth.getToken(token.id)).toEqual(full);
  });

  it("takes a later last use", async () => {
    const auth = store();
    await auth.addToken(token);
    await auth.touchToken(token.id, at("2026-08-31T12:00:00.000Z"));

    expect(await auth.getToken(token.id)).toMatchObject({
      lastUsedAt: "2026-08-31T12:00:00.000Z",
    });
  });

  it("lists oldest first", async () => {
    const auth = store();
    await auth.addToken({
      ...token,
      id: "token-2" as TokenId,
      createdAt: at("2026-08-30T09:00:00.000Z"),
    });
    await auth.addToken(token);

    expect((await auth.listTokens()).map((each) => each.id)).toEqual([
      "token-1",
      "token-2",
    ]);
  });

  it("revokes one, and all of them", async () => {
    const auth = store();
    await auth.addToken(token);
    await auth.addToken({ ...token, id: "token-2" as TokenId });

    await auth.deleteToken(token.id);
    expect(await auth.getToken(token.id)).toBeUndefined();
    expect(await auth.listTokens()).toHaveLength(1);

    await auth.deleteAllTokens();
    expect(await auth.listTokens()).toEqual([]);
  });
});

describe("sweeping what has expired", () => {
  const now = at("2026-09-10T09:00:00.000Z");

  it("takes a session whose expiry has passed and leaves one that has not", async () => {
    const auth = store();
    await auth.addSession(session);
    await auth.addSession({
      ...session,
      id: "session-2" as SessionId,
      expiresAt: at("2026-09-20T09:00:00.000Z"),
    });

    await auth.cleanExpired(now);

    expect(await auth.getSession(session.id)).toBeUndefined();
    expect(await auth.getSession("session-2" as SessionId)).toBeDefined();
  });

  it("keeps a token that carries no expiry", async () => {
    const auth = store();
    await auth.addToken(token);
    await auth.addToken({
      ...token,
      id: "token-2" as TokenId,
      expiresAt: at("2026-09-01T09:00:00.000Z"),
    });

    await auth.cleanExpired(now);

    expect((await auth.listTokens()).map((each) => each.id)).toEqual([
      "token-1",
    ]);
  });

  it("counts an expiry exactly now as passed", async () => {
    const auth = store();
    await auth.addSession({ ...session, expiresAt: now });

    await auth.cleanExpired(now);

    expect(await auth.getSession(session.id)).toBeUndefined();
  });
});
