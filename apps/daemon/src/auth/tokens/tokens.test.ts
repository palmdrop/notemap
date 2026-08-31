import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock, Timestamp } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { TOKEN_PART_SEPARATOR, TOKEN_PREFIX } from "../config";
import { createSqliteAuthStore } from "../store";
import type { AuthStore } from "../store/types";
import type { TokenId } from "../types";
import { createTokens, type Tokens } from ".";
import { TOUCH_AFTER_MS } from "./config";

const START = "2026-08-30T09:00:00.000Z";
const LATER = "2026-11-30T09:00:00.000Z";

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

function tokens(clock: Clock = frozenClock()): {
  tokens: Tokens;
  store: AuthStore;
} {
  const directory = mkdtempSync(join(tmpdir(), "notemap-tokens-"));
  const store = createSqliteAuthStore({ file: join(directory, "auth.db") });

  opened.push({ store, directory });
  return { tokens: createTokens(store, { clock }), store };
}

afterEach(async () => {
  for (const each of opened.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

const secretOf = (token: string) =>
  token.split(TOKEN_PART_SEPARATOR).at(-1) ?? "";

describe("minting an access token", () => {
  it("stores a row the token names, under the name it was given", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    expect(await opened.store.getToken(minted.id)).toMatchObject({
      id: minted.id,
      name: "laptop",
      createdAt: START,
    });
  });

  it("carries the prefix, so a leaked one is recognisable", async () => {
    const minted = await tokens().tokens.mint("laptop");

    expect(
      minted.token.startsWith(`${TOKEN_PREFIX}${TOKEN_PART_SEPARATOR}`),
    ).toBe(true);
  });

  it("never stores what the token carries", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");
    const stored = await opened.store.getToken(minted.id);

    expect(minted.token).not.toContain(stored!.secretHash);
    expect(stored!.secretHash).not.toContain(secretOf(minted.token));
  });

  it("takes an expiry, and does without one", async () => {
    const opened = tokens();

    const dated = await opened.tokens.mint("ci", LATER as Timestamp);
    const forever = await opened.tokens.mint("laptop");

    expect(await opened.store.getToken(dated.id)).toMatchObject({
      expiresAt: LATER,
    });
    expect(await opened.store.getToken(forever.id)).not.toHaveProperty(
      "expiresAt",
    );
  });

  it("has never been used", async () => {
    const minted = await tokens().tokens.mint("laptop");

    expect(minted).not.toHaveProperty("lastUsedAt");
  });
});

describe("verifying a presented token", () => {
  it("answers the record behind the token it minted", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    expect(await opened.tokens.verify(minted.token)).toMatchObject({
      id: minted.id,
      name: "laptop",
    });
  });

  it("accepts one that carries no expiry", async () => {
    // A token without an expiry never reaches one, which is the opposite of
    // being expired from the moment it was minted.
    const opened = tokens(frozenClock());
    const minted = await opened.tokens.mint("laptop");

    expect(await opened.tokens.verify(minted.token)).toBeDefined();
  });

  it("refuses a token it cannot read", async () => {
    const opened = tokens();
    await opened.tokens.mint("laptop");

    for (const token of ["", "nonsense", "nmp.only-two", "a.b.c.d"]) {
      expect(await opened.tokens.verify(token), token).toBeUndefined();
    }
  });

  it("refuses one presented without its prefix", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    const bare = minted.token.slice(
      `${TOKEN_PREFIX}${TOKEN_PART_SEPARATOR}`.length,
    );

    expect(await opened.tokens.verify(bare)).toBeUndefined();
  });

  it("refuses an id that names no token", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    expect(
      await opened.tokens.verify(
        [TOKEN_PREFIX, "nosuchtoken1111", secretOf(minted.token)].join(
          TOKEN_PART_SEPARATOR,
        ),
      ),
    ).toBeUndefined();
  });

  it("refuses the right id carrying another token's secret", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");
    const other = await opened.tokens.mint("phone");

    expect(
      await opened.tokens.verify(
        [TOKEN_PREFIX, minted.id, secretOf(other.token)].join(
          TOKEN_PART_SEPARATOR,
        ),
      ),
    ).toBeUndefined();
  });

  it("refuses a secret of the wrong length rather than throwing", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    expect(
      await opened.tokens.verify(
        [TOKEN_PREFIX, minted.id, Buffer.alloc(16).toString("base64url")].join(
          TOKEN_PART_SEPARATOR,
        ),
      ),
    ).toBeUndefined();
  });

  it("refuses a session token, which is not an access token", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    // A session presents `<id>.<secret>`, which must not read as a token.
    expect(
      await opened.tokens.verify(
        [minted.id, secretOf(minted.token)].join(TOKEN_PART_SEPARATOR),
      ),
    ).toBeUndefined();
  });
});

describe("a token that has expired", () => {
  it("stops verifying once its expiry passes", async () => {
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("ci", LATER as Timestamp);

    expect(await opened.tokens.verify(minted.token)).toBeDefined();

    clock.set("2026-12-01T09:00:00.000Z");

    expect(await opened.tokens.verify(minted.token)).toBeUndefined();
  });

  it("counts an expiry falling exactly now as passed", async () => {
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("ci", LATER as Timestamp);

    clock.set(LATER);

    expect(await opened.tokens.verify(minted.token)).toBeUndefined();
  });

  it("is kept and still listed, so it can say why a client stopped", async () => {
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("ci", LATER as Timestamp);

    clock.set("2026-12-01T09:00:00.000Z");
    await opened.tokens.verify(minted.token);

    expect(await opened.store.getToken(minted.id)).toBeDefined();
    expect((await opened.tokens.list()).map((each) => each.id)).toEqual([
      minted.id,
    ]);
  });
});

describe("listing and revoking", () => {
  it("lists what exists without any secret in it", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    const listed = await opened.tokens.list();

    expect(listed).toEqual([
      { id: minted.id, name: "laptop", createdAt: START },
    ]);
  });

  it("stops a revoked token on the next request", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    await opened.tokens.revoke(minted.id);

    expect(await opened.tokens.verify(minted.token)).toBeUndefined();
    expect(await opened.tokens.list()).toEqual([]);
  });

  it("takes revoking one that was already gone", async () => {
    const opened = tokens();

    await expect(
      opened.tokens.revoke("nosuchtoken1111" as TokenId),
    ).resolves.toBeUndefined();
  });
});

describe("recording that a token was used", () => {
  const laterBy = (from: string, ms: number) =>
    new Date(Date.parse(from) + ms).toISOString();

  it("records the first use, which nothing had recorded before", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    await opened.tokens.verify(minted.token);

    expect(await opened.store.getToken(minted.id)).toMatchObject({
      lastUsedAt: START,
    });
  });

  it("leaves it alone while it is still fresh", async () => {
    // The read path may not write on every request, which is the whole reason
    // this is coalesced rather than recorded each time.
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("laptop");

    await opened.tokens.verify(minted.token);
    clock.set(laterBy(START, TOUCH_AFTER_MS - 1000));
    await opened.tokens.verify(minted.token);

    expect(await opened.store.getToken(minted.id)).toMatchObject({
      lastUsedAt: START,
    });
  });

  it("records it again once the interval has passed", async () => {
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("laptop");

    await opened.tokens.verify(minted.token);

    const later = laterBy(START, TOUCH_AFTER_MS);
    clock.set(later);
    await opened.tokens.verify(minted.token);

    expect(await opened.store.getToken(minted.id)).toMatchObject({
      lastUsedAt: later,
    });
  });

  it("records nothing for a token that failed to verify", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");
    const other = await opened.tokens.mint("phone");

    await opened.tokens.verify(
      [TOKEN_PREFIX, minted.id, secretOf(other.token)].join(
        TOKEN_PART_SEPARATOR,
      ),
    );

    expect(await opened.store.getToken(minted.id)).not.toHaveProperty(
      "lastUsedAt",
    );
  });

  it("records nothing for a token that has expired", async () => {
    const clock = frozenClock();
    const opened = tokens(clock);
    const minted = await opened.tokens.mint("ci", LATER as Timestamp);

    clock.set("2026-12-01T09:00:00.000Z");
    await opened.tokens.verify(minted.token);

    expect(await opened.store.getToken(minted.id)).not.toHaveProperty(
      "lastUsedAt",
    );
  });

  it("still authenticates when the use cannot be recorded", async () => {
    const opened = tokens();
    const minted = await opened.tokens.mint("laptop");

    opened.store.touchToken = () => Promise.reject(new Error("disk full"));

    expect(await opened.tokens.verify(minted.token)).toBeDefined();
  });
});
