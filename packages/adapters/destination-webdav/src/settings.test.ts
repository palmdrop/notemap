import type { JsonObject } from "@notemap/core";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { describe, expect, it } from "vitest";

import { createWebdavDestination } from "./destination";
import { asWebdavSettings, WEBDAV_SETTINGS } from "./settings";
import { destinationRow, TEXT } from "./testing/fixture";

const validator = createAjvSchemaValidator();
const check = (settings: JsonObject) =>
  validator.validate(WEBDAV_SETTINGS, settings);

const adapter = () =>
  createWebdavDestination({
    accepts: [TEXT],
    credentials: () => Promise.reject(new Error("never asked")),
  });

describe("the settings a person fills in", () => {
  it("takes a profile and a folder", () => {
    expect(check({ profile: "nextcloud", root: "Notes/Vault" })).toEqual([]);
  });

  /**
   * A settings form sends nothing for a field somebody left blank, so a folder
   * that is required could never be the account's own however it is described.
   */
  it("takes the account's own folder, blank or absent", () => {
    expect(check({ profile: "nextcloud", root: "" })).toEqual([]);
    expect(check({ profile: "nextcloud" })).toEqual([]);
    expect(asWebdavSettings({ profile: "nextcloud" })).toEqual({
      profile: "nextcloud",
      root: "",
    });
  });

  /** The whole of ADR 28 as a schema: there is nowhere to put either. */
  it("has nowhere to put a URL or a password", () => {
    expect(
      check({
        profile: "nextcloud",
        root: "",
        baseUrl: "https://elsewhere.example/dav",
      }),
    ).not.toEqual([]);

    expect(
      check({ profile: "nextcloud", root: "", password: "hunter2" }),
    ).not.toEqual([]);
  });

  it("refuses settings with no profile", () => {
    expect(check({ root: "Notes" })).not.toEqual([]);
    expect(check({ profile: "", root: "Notes" })).not.toEqual([]);
  });

  it("reads back only what it would have accepted", () => {
    expect(asWebdavSettings({ profile: "nextcloud", root: "" })).toEqual({
      profile: "nextcloud",
      root: "",
    });
    expect(asWebdavSettings({ profile: 4, root: "" })).toBeUndefined();
    expect(asWebdavSettings({ profile: "nextcloud", root: 4 })).toBeUndefined();
    expect(asWebdavSettings({ root: "Notes" })).toBeUndefined();
  });
});

describe("describing a destination", () => {
  it("answers the filesystem kind's own capability names", async () => {
    const described = await adapter().describe(destinationRow({ root: "V" }));

    expect(described.capabilities.map((each) => each.name)).toEqual([
      "create-file",
      "append-to-file",
    ]);
  });

  /**
   * A Nextcloud that is asleep must still be routable, which is the property
   * deferred delivery rests on. The credential resolver rejecting for every
   * call is the proof: nothing here asked it anything.
   */
  it("touches the network for nothing, and asks for no credential", async () => {
    await expect(
      adapter().describe(destinationRow({ profile: "not-declared", root: "" })),
    ).resolves.toBeDefined();
  });

  it("does not claim its fields can be browsed", async () => {
    const described = await adapter().describe(destinationRow({ root: "V" }));

    for (const capability of described.capabilities) {
      expect(JSON.stringify(capability.argumentsSchema)).not.toContain(
        "x-notemap-candidates",
      );
    }
  });

  it("offers no candidates at all, there being nothing it could enumerate", () => {
    expect(adapter().candidates).toBeUndefined();
  });

  it("refuses settings the schema and the reader disagree about", async () => {
    const row = { ...destinationRow({ root: "V" }), settings: { root: 4 } };

    await expect(adapter().describe(row)).rejects.toThrow(/readable/);
  });
});
