import { afterEach, describe, expect, it } from "vitest";

import { createAuth } from "../auth";
import { createSqliteAuthStore } from "../auth/store";
import { systemClock } from "../ports";
import { listTokens, mintToken, revokeToken } from "./tokens";
import { cleanup, configured, said } from "./testing";

const opened = async (file: string) => {
  const store = createSqliteAuthStore({ file });
  return { auth: createAuth(store, { clock: systemClock }), store };
};

/** Everything but the announcement, which goes to stderr so a pipe gets the token alone. */
const tokenFrom = (out: string[]) => out.join("\n").trim();

/** Mints one and answers the token, which is the only time it is readable. */
const mintedBy = async (argv: string[], name: string): Promise<string> => {
  const heard = said();
  try {
    await mintToken([...argv, "--name", name]);
    return tokenFrom(heard.out);
  } finally {
    heard.restore();
  }
};

afterEach(cleanup);

describe("minting a token", () => {
  it("prints the token, and nothing else, on stdout", async () => {
    const { argv, auth: file } = configured();
    const heard = said();

    try {
      await mintToken([...argv, "--name", "laptop"]);
    } finally {
      heard.restore();
    }

    const token = tokenFrom(heard.out);
    expect(token.startsWith("nmp.")).toBe(true);
    expect(heard.out).toHaveLength(1);

    const { auth, store } = await opened(file);
    try {
      expect(await auth.authenticate("token", token)).toMatchObject({
        kind: "token",
        name: "laptop",
      });
    } finally {
      await store.close();
    }
  });

  it("puts what it did on stderr, so stdout stays the token", async () => {
    const { argv } = configured();
    const heard = said();

    try {
      await mintToken([...argv, "--name", "laptop"]);
    } finally {
      heard.restore();
    }

    expect(heard.err.join("\n")).toContain("only once");
  });

  it("takes an expiry, and refuses one it cannot read", async () => {
    const { argv, auth: file } = configured();
    const heard = said();

    try {
      await mintToken([...argv, "--name", "ci", "--expires", "2026-11-30"]);
      await expect(
        mintToken([...argv, "--name", "ci", "--expires", "whenever"]),
      ).rejects.toThrow(/not an instant/);
    } finally {
      heard.restore();
    }

    const { auth, store } = await opened(file);
    try {
      const [held] = await auth.listTokens();
      expect(held?.expiresAt).toBe("2026-11-30T00:00:00.000Z");
      // The one it could not read minted nothing.
      expect(await auth.listTokens()).toHaveLength(1);
    } finally {
      await store.close();
    }
  });

  it("needs a name to mint under", async () => {
    const { argv } = configured();

    await expect(mintToken(argv)).rejects.toThrow(/--name/);
  });
});

describe("listing tokens", () => {
  it("says so plainly when there are none", async () => {
    const { argv } = configured();
    const heard = said();

    try {
      await listTokens(argv);
    } finally {
      heard.restore();
    }

    expect(heard.out.join("\n")).toContain("no access tokens");
  });

  it("names each one and when it was last used, and no secret", async () => {
    const { argv } = configured();
    const minted = await mintedBy(argv, "laptop");

    const heard = said();
    try {
      await listTokens(argv);
    } finally {
      heard.restore();
    }

    const printed = heard.out.join("\n");

    expect(heard.out[0]).toContain("last used");
    expect(printed).toContain("laptop");
    expect(printed).toContain("never");
    expect(printed).not.toContain(minted);
    expect(printed).not.toContain("secretHash");
  });
});

describe("revoking a token", () => {
  it("stops the token working, and says which one went", async () => {
    const { argv, auth: file } = configured();
    const minted = await mintedBy(argv, "laptop");
    const [, id] = minted.split(".");

    const heard = said();
    try {
      await revokeToken([...argv, id ?? ""]);
    } finally {
      heard.restore();
    }

    expect(heard.out.join("\n")).toContain(id ?? "");

    const { auth, store } = await opened(file);
    try {
      expect(await auth.authenticate("token", minted)).toBeUndefined();
    } finally {
      await store.close();
    }
  });

  /** `/v1` answers 204 either way; a person naming an id by hand wants to be told. */
  it("refuses an id nothing is filed under, unlike the route", async () => {
    const { argv } = configured();

    await expect(revokeToken([...argv, "nosuchtoken1111"])).rejects.toThrow(
      /no access token/,
    );
  });

  it("needs an id", async () => {
    const { argv } = configured();

    await expect(revokeToken(argv)).rejects.toThrow(/its id/);
  });
});
