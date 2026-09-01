import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPassword,
  joinHash,
  needsRehash,
  splitHash,
  verifyPassword,
} from ".";
import { UnreadableHash, UnusablePassword } from "./errors";
import scrypt from "./scrypt";

const PASSWORD = "correct horse battery staple";

const CHEAP = { N: 1024, r: 8, p: 1, keylen: 32 };

// A hash written down once, never regenerated. The encoded string is a stored
// format: reordering its fields, changing the separator or switching to hex
// leaves every other test in this file passing and every saved password
// unverifiable.
const FROZEN =
  "scrypt$32$1024$8$1$bm90ZW1hcCBmcm96ZW4gdmVjdG9yIHNhbHQ=$sUDcO2m7LWqreIXWp/ODtMT03DpFsWDUTbfKd9ekD4U=";

const FIELDS = ["algorithm", "keylen", "N", "r", "p", "salt", "key"] as const;

const rewrite = (
  stored: string,
  field: (typeof FIELDS)[number],
  rewriter: (value: string) => string,
) => {
  const parts = splitHash(stored);
  const index = FIELDS.indexOf(field);

  return joinHash(parts.with(index, rewriter(parts[index]!)));
};

describe("what a hashed password looks like", () => {
  it("encodes the algorithm, its parameters, the salt and the key", async () => {
    const [algorithm, keylen, N, r, p, salt, key] = splitHash(
      await hashPassword(PASSWORD),
    );

    expect(algorithm).toBe("scrypt");
    expect({ keylen, N, r, p }).toEqual({
      keylen: "64",
      N: "65536",
      r: "8",
      p: "2",
    });
    expect(salt).toBeTruthy();
    expect(key).toBeTruthy();
  });

  /**
   * OWASP's floor for scrypt is `N=2^17, r=8, p=1`, and it lists sets of equal
   * work beside it — `N * r * p` is what they hold constant. This says the
   * numbers above are one of those rather than a guess, which the numbers
   * themselves cannot.
   */
  it("costs at least what OWASP asks of scrypt", async () => {
    const [, , N, r, p] = splitHash(await hashPassword(PASSWORD));

    expect(Number(N) * Number(r) * Number(p)).toBeGreaterThanOrEqual(
      2 ** 17 * 8 * 1,
    );
  });

  it("never contains the password", async () => {
    expect(await hashPassword(PASSWORD)).not.toContain(PASSWORD);
  });

  it("differs between two hashes of the same password", async () => {
    // A fresh salt per hash, so equal passwords must not give equal hashes.
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it("carries the parameters it was given rather than the defaults", async () => {
    const [, keylen, N, r, p] = splitHash(
      await hashPassword(PASSWORD, "scrypt", CHEAP),
    );

    expect({ keylen, N, r, p }).toEqual({
      keylen: "32",
      N: "1024",
      r: "8",
      p: "1",
    });
  });
});

describe("verifying a password against a stored hash", () => {
  it("accepts the password it was hashed from", async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(
      true,
    );
  });

  it("refuses any other password", async () => {
    const stored = await hashPassword(PASSWORD);

    for (const wrong of [
      "correct horse battery stapl",
      "correct horse battery staple ",
      "Correct horse battery staple",
      "",
    ]) {
      expect(await verifyPassword(wrong, stored), wrong).toBe(false);
    }
  });

  it("reads the parameters off the hash instead of using the current ones", async () => {
    // What keeps hashes written under older parameters verifiable after the
    // defaults are tuned.
    const stored = await hashPassword(PASSWORD, "scrypt", CHEAP);

    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("still accepts a hash written down before any of this changed", async () => {
    expect(await verifyPassword(PASSWORD, FROZEN)).toBe(true);
    expect(await verifyPassword("wrong", FROZEN)).toBe(false);
  });

  it("refuses a hash with fields missing", async () => {
    for (const stored of ["", "scrypt", "scrypt$64$16384$8$1$salt"]) {
      await expect(verifyPassword(PASSWORD, stored), stored).rejects.toThrow(
        UnreadableHash,
      );
    }
  });

  it("refuses a hash whose parameters are not numbers", async () => {
    for (const field of ["keylen", "N", "r", "p"] as const) {
      const stored = rewrite(FROZEN, field, () => "eight");

      await expect(verifyPassword(PASSWORD, stored), field).rejects.toThrow(
        UnreadableHash,
      );
    }
  });

  it("refuses a hash naming an algorithm it does not have", async () => {
    await expect(
      verifyPassword(
        PASSWORD,
        rewrite(FROZEN, "algorithm", () => "argon2id"),
      ),
    ).rejects.toThrow(new UnreadableHash("unknown algorithm"));
  });
});

describe("how a password is spelled before it is hashed", () => {
  const composed = "caf\u00e9 au lait";
  const decomposed = "cafe\u0301 au lait";

  it("takes two spellings of the same accent as the same password", async () => {
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(
      true,
    );
    expect(await verifyPassword(composed, await hashPassword(decomposed))).toBe(
      true,
    );
  });

  it("keeps compatibility variants apart", async () => {
    // NFC rather than NFKC. Folding these would merge passwords their owner
    // chose as different, and quietly narrow the space they were chosen from.
    // Padded, because the pairs themselves are under the minimum length.
    const enough = (password: string) => `${password} au lait please`;

    for (const [a, b] of [
      ["abc", "\uff41bc"],
      ["fi", "\ufb01"],
      ["2", "\u00b2"],
    ]) {
      expect(
        await verifyPassword(enough(b!), await hashPassword(enough(a!))),
        b,
      ).toBe(false);
    }
  });

  it("measures the length limit in bytes, not characters", async () => {
    await expect(hashPassword("a".repeat(4096))).resolves.toBeDefined();
    await expect(hashPassword("\u00e9".repeat(2048))).resolves.toBeDefined();

    await expect(hashPassword("\u00e9".repeat(2049))).rejects.toThrow(
      "password-too-long",
    );
  });
});

describe("a password that cannot be stored", () => {
  const unstorable = [
    ["", "password-empty"],
    ["a".repeat(4097), "password-too-long"],
    ["pass\u0000word", "password-forbidden-characters"],
    ["pass\u007fword", "password-forbidden-characters"],
    ["pass\ud800word", "password-forbidden-characters"],
  ] as const;

  it("is refused when hashing, naming what was wrong with it", async () => {
    for (const [password, refusal] of unstorable) {
      const error = await hashPassword(password).catch((thrown) => thrown);

      expect(error, refusal).toBeInstanceOf(UnusablePassword);
      expect(error.refusal).toBe(refusal);
    }
  });

  it("is a failed login rather than an error when verifying", async () => {
    // A sign-in form can produce every one of these, and none of them can be
    // behind a stored hash.
    const stored = await hashPassword(PASSWORD);

    for (const [password, refusal] of unstorable) {
      expect(await verifyPassword(password, stored), refusal).toBe(false);
    }
  });
});

describe("a password shorter than the minimum", () => {
  it("cannot be chosen", async () => {
    const error = await hashPassword("elevenchars").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(UnusablePassword);
    expect(error.refusal).toBe("password-too-short");
  });

  it("counts characters rather than the bytes they take", async () => {
    await expect(hashPassword("\u00e9".repeat(11))).rejects.toThrow(
      "password-too-short",
    );
    await expect(hashPassword("\u00e9".repeat(12))).resolves.toBeDefined();
  });

  /**
   * The rule is on what may be chosen. One stored before it was raised is
   * still the password that daemon holds, and refusing to weigh it would lock
   * its owner out with nothing said.
   */
  it("still opens the door where one is already stored", async () => {
    const stored = await scrypt.hash("elevenchars", randomBytes(16), CHEAP);

    expect(await verifyPassword("elevenchars", stored)).toBe(true);
    expect(await verifyPassword("elevenchar", stored)).toBe(false);
  });
});

describe("a stored hash that has been tampered with", () => {
  it("refuses a key with a character changed", async () => {
    const stored = rewrite(
      FROZEN,
      "key",
      (key) => (key[0] === "A" ? "B" : "A") + key.slice(1),
    );

    expect(await verifyPassword(PASSWORD, stored)).toBe(false);
  });

  it("refuses a truncated key rather than throwing on the comparison", async () => {
    // `timingSafeEqual` throws on operands of unequal length; the length check
    // in front of it is what turns a short key into a plain refusal.
    const stored = rewrite(FROZEN, "key", (key) => key.slice(0, 24));

    expect(await verifyPassword(PASSWORD, stored)).toBe(false);
  });

  it("refuses a salt that is not the one hashed against", async () => {
    const stored = rewrite(FROZEN, "salt", () =>
      Buffer.from("some other salt").toString("base64"),
    );

    expect(await verifyPassword(PASSWORD, stored)).toBe(false);
  });

  it("refuses parameters that have been edited under the key", async () => {
    for (const [field, value] of [
      ["N", "2048"],
      ["r", "16"],
      ["p", "2"],
      ["keylen", "64"],
    ] as const) {
      const stored = rewrite(FROZEN, field, () => value);

      expect(await verifyPassword(PASSWORD, stored), field).toBe(false);
    }
  });
});

describe("whether a stored hash is behind this build", () => {
  const weakened = (hash: string, params: string) => {
    const [algorithm, keylen, , , , salt, key] = splitHash(hash);
    return [algorithm, keylen, params, salt, key].join("$");
  };

  it("says no to one this build just wrote", async () => {
    expect(await needsRehash(await hashPassword(PASSWORD))).toBe(false);
  });

  it("says yes to one turned down below what is written now", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(await needsRehash(weakened(stored, "16384$8$1"))).toBe(true);
  });

  /** Rehashing to match would weaken it, so a stronger hash is left alone. */
  it("says no to one written stronger than this build writes", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(await needsRehash(weakened(stored, "131072$8$4"))).toBe(false);
  });

  it("says yes to an algorithm this build no longer writes", async () => {
    expect(await needsRehash("pbkdf2$64$1000$c2FsdA$a2V5")).toBe(true);
  });
});
