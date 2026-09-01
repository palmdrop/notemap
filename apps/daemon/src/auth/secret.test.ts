import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { TOKEN_PART_SEPARATOR, TOKEN_PREFIX } from "./config";
import {
  getRandomId,
  hasPassed,
  hashSecret,
  mintSecret,
  parseSecret,
  sameSecretly,
} from "./secret";

describe("the id a secret is filed under", () => {
  it("avoids the characters a person would misread", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(getRandomId()).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{16}$/);
    }
  });

  it("differs every time", () => {
    const ids = new Set(Array.from({ length: 100 }, getRandomId));
    expect(ids.size).toBe(100);
  });
});

describe("minting a secret", () => {
  it("presents the id and the secret, and keeps neither of them stored", async () => {
    const minted = await mintSecret();
    const [id, secret] = minted.token.split(TOKEN_PART_SEPARATOR);

    expect(id).toBe(minted.id);
    expect(secret).toBeTruthy();
    expect(minted.token).not.toContain(minted.secretHash);
  });

  it("carries the prefix when it is given one", async () => {
    const minted = await mintSecret(TOKEN_PREFIX);

    expect(
      minted.token.startsWith(`${TOKEN_PREFIX}${TOKEN_PART_SEPARATOR}`),
    ).toBe(true);
    expect(minted.token.split(TOKEN_PART_SEPARATOR)).toHaveLength(3);
  });

  it("splits into one part more when it carries a prefix", async () => {
    // The separator may appear in neither the id alphabet nor base64url. A
    // change to either that broke this would break every parse, so it is
    // pinned here rather than assumed.
    expect((await mintSecret()).token.split(TOKEN_PART_SEPARATOR)).toHaveLength(
      2,
    );
    expect(
      (await mintSecret(TOKEN_PREFIX)).token.split(TOKEN_PART_SEPARATOR),
    ).toHaveLength(3);
  });

  it("encodes the secret in an alphabet the separator is not in", async () => {
    for (const prefix of [undefined, TOKEN_PREFIX]) {
      const parts = (await mintSecret(prefix)).token.split(
        TOKEN_PART_SEPARATOR,
      );

      expect(parts.at(-1), String(prefix)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("stores the hash of the secret it presented", async () => {
    const minted = await mintSecret();
    const [, secret] = minted.token.split(TOKEN_PART_SEPARATOR);

    const expected = createHash("sha256")
      .update(Buffer.from(secret!, "base64url"))
      .digest()
      .toString("base64");

    expect(minted.secretHash).toBe(expected);
  });

  it("draws 32 bytes, and different ones each time", async () => {
    const first = await mintSecret();
    const second = await mintSecret();

    const secretOf = (token: string) =>
      Buffer.from(token.split(TOKEN_PART_SEPARATOR)[1]!, "base64url");

    expect(secretOf(first.token)).toHaveLength(32);
    expect(secretOf(first.token)).not.toEqual(secretOf(second.token));
    expect(first.id).not.toBe(second.id);
  });
});

describe("hashing a secret", () => {
  it("answers the same 32 bytes for the same input", () => {
    const secret = Buffer.from("a secret");

    expect(hashSecret(secret)).toHaveLength(32);
    expect(hashSecret(secret)).toEqual(hashSecret(secret));
  });

  it("answers differently for a secret one byte apart", () => {
    expect(hashSecret(Buffer.from("secret-a"))).not.toEqual(
      hashSecret(Buffer.from("secret-b")),
    );
  });
});

describe("reading a presented secret back", () => {
  it("round-trips one minted without a prefix", async () => {
    const minted = await mintSecret();

    expect(parseSecret(minted.token)).toMatchObject({ id: minted.id });
  });

  it("round-trips one minted with a prefix", async () => {
    const minted = await mintSecret(TOKEN_PREFIX);

    expect(parseSecret(minted.token, TOKEN_PREFIX)).toMatchObject({
      id: minted.id,
    });
  });

  it("hands back the secret exactly as it arrived", async () => {
    const minted = await mintSecret();
    const [, secret] = minted.token.split(TOKEN_PART_SEPARATOR);

    expect(parseSecret(minted.token)?.secret).toBe(secret);
  });

  it("refuses a string that is not two parts", () => {
    for (const token of [
      "",
      "onlyanid",
      "an.id.and.too.much",
      ".leading",
      "trailing.",
    ]) {
      expect(parseSecret(token), token).toBeUndefined();
    }
  });

  it("refuses a prefix that is not the one expected", async () => {
    const minted = await mintSecret("other");

    expect(parseSecret(minted.token, TOKEN_PREFIX)).toBeUndefined();
  });

  it("refuses a prefixed secret read as an unprefixed one, and the reverse", async () => {
    const prefixed = await mintSecret(TOKEN_PREFIX);
    const bare = await mintSecret();

    expect(parseSecret(prefixed.token)).toBeUndefined();
    expect(parseSecret(bare.token, TOKEN_PREFIX)).toBeUndefined();
  });
});

describe("whether an instant has passed", () => {
  const AT = "2026-08-31T09:00:00.000Z";

  it("is true once it is reached, and at the moment it is", () => {
    expect(hasPassed("2026-08-31T09:00:00.001Z", AT)).toBe(true);
    expect(hasPassed(AT, AT)).toBe(true);
  });

  it("is false a moment before", () => {
    expect(hasPassed("2026-08-31T08:59:59.999Z", AT)).toBe(false);
  });

  /**
   * Fails closed. A row whose expiry nothing can read is not a row anything
   * should keep honouring, and reading it as "not yet" is a token that never
   * expires.
   */
  it("is true when either side cannot be read at all", () => {
    expect(hasPassed(AT, "whenever")).toBe(true);
    expect(hasPassed("whenever", AT)).toBe(true);
    expect(hasPassed("", "")).toBe(true);
  });
});

describe("comparing two strings without saying where they differ", () => {
  it("is true for the same string", () => {
    expect(sameSecretly("anton", "anton")).toBe(true);
    expect(sameSecretly("", "")).toBe(true);
  });

  it("is false for anything else, whatever the lengths", () => {
    expect(sameSecretly("anton", "antoN")).toBe(false);
    expect(sameSecretly("anton", "")).toBe(false);
    expect(sameSecretly("anton", "anton with more after it")).toBe(false);
  });
});
