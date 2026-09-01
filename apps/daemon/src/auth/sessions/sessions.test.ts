import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { TOKEN_PART_SEPARATOR } from "../config";
import { createSqliteAuthStore } from "../store";
import type { AuthStore } from "../store/types";
import type { SessionId } from "../types";
import { createSessions, type Sessions } from ".";
import { AUTH_SESSION_EXPIRES_IN_SECONDS } from "./config";

const START = "2026-08-30T09:00:00.000Z";

/** Stands still until a test moves it. */
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

function sessions(clock: Clock = frozenClock()): {
  sessions: Sessions;
  store: AuthStore;
} {
  const directory = mkdtempSync(join(tmpdir(), "notemap-sessions-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  opened.push({ store, directory });
  return { sessions: createSessions(store, { clock }), store };
}

afterEach(async () => {
  for (const each of opened.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

/** Ten days on, plus a minute, so nothing rests on the boundary. */
const wellAfterExpiry = "2026-09-09T09:01:00.000Z";

describe("minting a session", () => {
  it("stores a row the presented cookie names", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    expect(await opened.store.getSession(minted.id)).toMatchObject({
      id: minted.id,
      createdAt: START,
    });
  });

  it("never stores what the cookie carries", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();
    const stored = await opened.store.getSession(minted.id);

    // The whole point of hashing: reading the database must not let anyone
    // present a session.
    expect(minted.token).not.toContain(stored!.secretHash);
    expect(stored!.secretHash).not.toContain(
      minted.token.split(TOKEN_PART_SEPARATOR)[1],
    );
  });

  it("expires the configured span after it was made", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    expect(Date.parse(minted.expiresAt) - Date.parse(START)).toBe(
      AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
    );
  });

  it("gives every session its own secret", async () => {
    const opened = sessions();
    const first = await opened.sessions.mint();
    const second = await opened.sessions.mint();

    expect(first.id).not.toBe(second.id);
    expect(first.token).not.toBe(second.token);
  });
});

describe("verifying a presented session", () => {
  it("answers the record behind the cookie it minted", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    expect(await opened.sessions.verify(minted.token)).toMatchObject({
      id: minted.id,
    });
  });

  it("refuses a cookie it cannot read", async () => {
    const opened = sessions();
    await opened.sessions.mint();

    for (const token of ["", "nonsense", "too.many.parts.here", ".", "id."]) {
      expect(await opened.sessions.verify(token), token).toBeUndefined();
    }
  });

  it("refuses an id that names no session", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();
    const [, secret] = minted.token.split(TOKEN_PART_SEPARATOR);

    expect(
      await opened.sessions.verify(
        `nosuchsession11${TOKEN_PART_SEPARATOR}${secret}`,
      ),
    ).toBeUndefined();
  });

  it("refuses the right id carrying the wrong secret", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();
    const other = await opened.sessions.mint();
    const [, otherSecret] = other.token.split(TOKEN_PART_SEPARATOR);

    expect(
      await opened.sessions.verify(
        `${minted.id}${TOKEN_PART_SEPARATOR}${otherSecret}`,
      ),
    ).toBeUndefined();
  });

  it("refuses a secret of the right shape but the wrong length", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();
    const short = Buffer.alloc(16).toString("base64url");

    // The length guard in front of `timingSafeEqual`, which throws on operands
    // of unequal length rather than answering false.
    expect(
      await opened.sessions.verify(
        `${minted.id}${TOKEN_PART_SEPARATOR}${short}`,
      ),
    ).toBeUndefined();
  });

  it("refuses a secret that is not base64 at all", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    expect(
      await opened.sessions.verify(`${minted.id}${TOKEN_PART_SEPARATOR}!!!!`),
    ).toBeUndefined();
  });

  it("leaves the session usable after a failed attempt", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    await opened.sessions.verify(
      `${minted.id}${TOKEN_PART_SEPARATOR}${Buffer.alloc(32).toString("base64url")}`,
    );

    expect(await opened.sessions.verify(minted.token)).toBeDefined();
  });
});

describe("a session that has expired", () => {
  it("stops verifying", async () => {
    const clock = frozenClock();
    const opened = sessions(clock);
    const minted = await opened.sessions.mint();

    clock.set(wellAfterExpiry);

    expect(await opened.sessions.verify(minted.token)).toBeUndefined();
  });

  it("is deleted as it is refused, rather than waiting for a sweep", async () => {
    const clock = frozenClock();
    const opened = sessions(clock);
    const minted = await opened.sessions.mint();

    clock.set(wellAfterExpiry);
    await opened.sessions.verify(minted.token);

    expect(await opened.store.getSession(minted.id)).toBeUndefined();
  });

  it("counts an expiry falling exactly now as passed", async () => {
    const clock = frozenClock();
    const opened = sessions(clock);
    const minted = await opened.sessions.mint();

    clock.set(minted.expiresAt);

    expect(await opened.sessions.verify(minted.token)).toBeUndefined();
  });

  it("still verifies a moment before it lapses", async () => {
    const clock = frozenClock();
    const opened = sessions(clock);
    const minted = await opened.sessions.mint();

    clock.set(new Date(Date.parse(minted.expiresAt) - 1).toISOString());

    expect(await opened.sessions.verify(minted.token)).toBeDefined();
  });

  it("does not delete a session that is merely wrong", async () => {
    const opened = sessions();
    const minted = await opened.sessions.mint();

    await opened.sessions.verify(
      `${minted.id}${TOKEN_PART_SEPARATOR}${Buffer.alloc(32).toString("base64url")}`,
    );

    expect(await opened.store.getSession(minted.id as SessionId)).toBeDefined();
  });
});
