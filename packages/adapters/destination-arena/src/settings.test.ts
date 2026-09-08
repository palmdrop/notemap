import type { JsonObject } from "@notemap/core";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { describe, expect, it } from "vitest";

import { ARENA_ACCOUNT } from "./credentials";
import { arenaSettings, asArenaSettings } from "./settings";

const validator = createAjvSchemaValidator();
const check = (settings: JsonObject) =>
  validator.validate(arenaSettings([]), settings);
const account = (held: JsonObject) => validator.validate(ARENA_ACCOUNT, held);

describe("the settings a person fills in", () => {
  /** A destination *is* the account: the channel is an argument, so browsing reaches it. */
  it("takes an account and nothing else", () => {
    expect(check({ account: "are-na" })).toEqual([]);
    expect(check({ account: "are-na", channel: "reading" })).not.toEqual([]);
  });

  it("has nowhere to put a token", () => {
    expect(check({ account: "are-na", token: "secret" })).not.toEqual([]);
    expect(check({ account: "are-na", secret: "secret" })).not.toEqual([]);
  });

  it("refuses settings naming no account", () => {
    expect(check({})).not.toEqual([]);
    expect(check({ account: "" })).not.toEqual([]);
  });

  /**
   * The declared accounts are `examples` and not an `enum` for the reason the
   * webdav kind's are: settings are re-validated on every describe, so a
   * constraining list would turn a destination unusable the moment an account
   * is renamed in config.
   */
  it("takes an account that is not one of the declared ones", () => {
    expect(
      validator.validate(arenaSettings(["home"]), { account: "retired" }),
    ).toEqual([]);
  });

  it("reads back only what it would have accepted", () => {
    expect(asArenaSettings({ account: "are-na" })).toEqual({
      account: "are-na",
    });
    expect(asArenaSettings({})).toBeUndefined();
    expect(asArenaSettings({ account: 4 })).toBeUndefined();
  });
});

/** Checked when the daemon starts, which is the point of a kind declaring one. */
describe("the account this kind needs", () => {
  it("takes a name and a secret, and asks for nothing else", () => {
    expect(
      account({ kind: "arena", name: "mine", secretFile: "~/.are-na" }),
    ).toEqual([]);
    expect(
      account({ kind: "arena", name: "mine", secretEnv: "ARENA_TOKEN" }),
    ).toEqual([]);
  });

  /** None of ADR 28's three fields fits: no username, and the address is the service's. */
  it("has nowhere to put a base URL or a username", () => {
    expect(
      account({
        kind: "arena",
        name: "mine",
        secretEnv: "ARENA_TOKEN",
        baseUrl: "https://elsewhere.example",
      }),
    ).not.toEqual([]);
    expect(
      account({
        kind: "arena",
        name: "mine",
        secretEnv: "ARENA_TOKEN",
        username: "alice",
      }),
    ).not.toEqual([]);
  });

  /** A misspelt key is a daemon running without the credential somebody meant to give it. */
  it("refuses a key it does not know, rather than ignoring it", () => {
    expect(
      account({ kind: "arena", name: "mine", secretFilee: "~/.are-na" }),
    ).not.toEqual([]);
  });

  it("refuses an account of another kind", () => {
    expect(
      account({ kind: "webdav", name: "mine", secretEnv: "ARENA_TOKEN" }),
    ).not.toEqual([]);
  });
});
