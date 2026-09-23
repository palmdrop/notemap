import type { JsonObject } from "@notemap/core";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { describe, expect, it } from "vitest";

import { asWebdavCredential, WEBDAV_ACCOUNT } from "./credentials";
import { createWebdavDestination } from "./destination";
import { asWebdavSettings, webdavSettings } from "./settings";
import { destinationRow, TEXT } from "./testing/fixture";

const validator = createAjvSchemaValidator();
const check = (settings: JsonObject) =>
  validator.validate(webdavSettings([]), settings);

const adapter = () =>
  createWebdavDestination({
    accepts: [TEXT],
    credentials: () => Promise.reject(new Error("never asked")),
  });

describe("the settings a person fills in", () => {
  it("takes an account and a folder", () => {
    expect(check({ account: "nextcloud", root: "Notes/Vault" })).toEqual([]);
  });

  /** Blank is a value here, and the shape `create`'s own folder field has. */
  it("takes a blank folder, which is the account's own", () => {
    expect(check({ account: "nextcloud", root: "" })).toEqual([]);
    expect(asWebdavSettings({ account: "nextcloud", root: "" })).toEqual({
      account: "nextcloud",
      root: "",
    });
  });

  /** The whole of ADR 28 as a schema: there is nowhere to put either. */
  it("has nowhere to put a URL or a password", () => {
    expect(
      check({
        account: "nextcloud",
        root: "",
        baseUrl: "https://elsewhere.example/dav",
      }),
    ).not.toEqual([]);

    expect(
      check({ account: "nextcloud", root: "", password: "hunter2" }),
    ).not.toEqual([]);
  });

  it("takes a frontmatter mode, and never requires one", () => {
    expect(
      check({ account: "nextcloud", root: "", frontmatter: "full" }),
    ).toEqual([]);
    expect(check({ account: "nextcloud", root: "" })).toEqual([]);
    expect(
      check({ account: "nextcloud", root: "", frontmatter: "some" }),
    ).not.toEqual([]);
  });

  it("refuses settings with no account", () => {
    expect(check({ root: "Notes" })).not.toEqual([]);
    expect(check({ account: "", root: "Notes" })).not.toEqual([]);
  });

  /**
   * The whole reason the declared accounts are `examples` and not an `enum`:
   * a destination whose account was renamed in config must go on describing
   * itself, and fail where a delivery finds out.
   */
  it("takes an account that is not one of the declared ones", () => {
    const declared = validator.validate(webdavSettings(["home", "work"]), {
      account: "retired-last-week",
      root: "Notes",
    });

    expect(declared).toEqual([]);
  });

  it("publishes the declared accounts for a person to choose from", () => {
    const properties = webdavSettings(["home", "work"])["properties"] as Record<
      string,
      Record<string, unknown>
    >;

    expect(properties["account"]?.["examples"]).toEqual(["home", "work"]);
  });

  it("publishes none where the daemon declares none", () => {
    const properties = webdavSettings([])["properties"] as Record<
      string,
      Record<string, unknown>
    >;

    expect(properties["account"]).not.toHaveProperty("examples");
  });

  it("reads back only what it would have accepted", () => {
    expect(asWebdavSettings({ account: "nextcloud", root: "" })).toEqual({
      account: "nextcloud",
      root: "",
    });
    expect(asWebdavSettings({ account: 4, root: "" })).toBeUndefined();
    expect(asWebdavSettings({ account: "nextcloud", root: 4 })).toBeUndefined();
    expect(asWebdavSettings({ account: "nextcloud" })).toBeUndefined();
    expect(asWebdavSettings({ root: "Notes" })).toBeUndefined();
    expect(
      asWebdavSettings({ account: "nextcloud", root: "", frontmatter: "some" }),
    ).toBeUndefined();
    expect(
      asWebdavSettings({ account: "nextcloud", root: "", frontmatter: "full" }),
    ).toEqual({ account: "nextcloud", root: "", frontmatter: "full" });
  });
});

describe("describing a destination", () => {
  it("answers the filesystem kind's own capability names", async () => {
    const described = await adapter().describe(destinationRow({ root: "V" }));

    expect(described.capabilities.map((each) => each.name)).toEqual([
      "create-or-append",
      "create",
      "append",
    ]);
  });

  /**
   * A Nextcloud that is asleep must still be routable, which is the property
   * deferred delivery rests on. The credential resolver rejecting for every
   * call is the proof: nothing here asked it anything.
   */
  it("touches the network for nothing, and asks for no credential", async () => {
    await expect(
      adapter().describe(destinationRow({ account: "not-declared", root: "" })),
    ).resolves.toBeDefined();
  });

  it("says which of its fields can be browsed, and which cannot", async () => {
    const described = await adapter().describe(destinationRow({ root: "V" }));
    const line = described.capabilities.find(
      (each) => each.name === "create-or-append",
    );
    const properties = (line?.argumentsSchema as Record<string, unknown>)[
      "properties"
    ] as Record<string, Record<string, unknown>>;

    expect(properties["path"]).toHaveProperty("x-notemap-candidates", true);
    expect(properties["heading"]).not.toHaveProperty("x-notemap-candidates");
  });

  /** Describing never touches the network; enumerating is the call that does. */
  it("offers candidates, which is a second call and not this one", () => {
    expect(adapter().candidates).toBeTypeOf("function");
  });

  it("refuses settings the schema and the reader disagree about", async () => {
    const row = { ...destinationRow({ root: "V" }), settings: { root: 4 } };

    await expect(adapter().describe(row)).rejects.toThrow(/readable/);
  });
});

/** Everything but the secret, which the host holds and this never sees. */
describe("the account this kind needs", () => {
  const account = (held: JsonObject) =>
    validator.validate(WEBDAV_ACCOUNT, held);

  const declared = {
    baseUrl: "https://cloud.example/dav",
    username: "alice",
  };

  it("takes an address and a username", () => {
    expect(account(declared)).toEqual([]);
  });

  it("refuses an account with no address or no username", () => {
    const { baseUrl: _address, ...noAddress } = declared;
    const { username: _who, ...noUsername } = declared;

    expect(account(noAddress)).not.toEqual([]);
    expect(account(noUsername)).not.toEqual([]);
  });

  /**
   * A statement about Basic auth over a URL, which is why it is here and not in
   * the daemon's config reader: it means nothing to a kind that has no URL.
   */
  it("refuses a scheme an account of this kind is never reached over", () => {
    expect(
      account({ ...declared, baseUrl: "ftp://cloud.example/dav" }),
    ).not.toEqual([]);
  });

  it("refuses a key it does not know, rather than ignoring it", () => {
    expect(account({ ...declared, usename: "alice" })).not.toEqual([]);
  });

  /** Where the password is read from is the host's to know, never the kind's. */
  it("has nowhere to say where a password is read from", () => {
    expect(account({ ...declared, passwordEnv: "NC" })).not.toEqual([]);
    expect(account({ ...declared, passwordFile: "/run/a" })).not.toEqual([]);
  });

  /** What a base URL may end in is this kind's business, so the slash goes here. */
  it("drops a trailing slash when it reads the account back", () => {
    expect(
      asWebdavCredential({
        ...declared,
        baseUrl: "https://cloud.example/dav/",
        secret: "an-app-password",
      }),
    ).toEqual({
      baseUrl: "https://cloud.example/dav",
      username: "alice",
      password: "an-app-password",
    });
  });
});
