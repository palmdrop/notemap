import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultAssetRoot,
  defaultConfigPath,
  defaultPoolPath,
  parseConfig,
} from "./load";

const EXAMPLE = fileURLToPath(
  new URL("../../config.example.toml", import.meta.url),
);

const parse = (source: string) => parseConfig(source, "test.toml");

describe("the example config", () => {
  it("is a config this daemon can load", () => {
    const config = parse(readFileSync(EXAMPLE, "utf8"));

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(
      join(homedir(), ".local/share/notemap/state/notemap.db"),
    );
    expect(config.mirror).toEqual({
      root: join(homedir(), ".local/share/notemap/pool-mirror"),
      pollIntervalMs: 1000,
      leaseForMs: 60_000,
      batch: 16,
    });
    expect(config.assets).toEqual({
      root: join(homedir(), ".local/share/notemap/assets"),
      maxUploadBytes: 268_435_456,
    });
    expect(config.sweep).toEqual({ intervalMs: 3_600_000 });
    expect(config.delivery).toEqual({
      pollIntervalMs: 5_000,
      leaseForMs: 300_000,
      batch: 4,
    });
    expect(config.destinations).toEqual([]);
    expect(config.poolConfig.sweep).toEqual({ grace: 86_400_000 });
    expect(config.poolConfig.sources).toEqual([{ id: "web", autoRequest: [] }]);
    expect(config.poolConfig.payloadTypes).toEqual([
      {
        name: "text",
        requiredSlots: [],
        contentSchema: {
          type: "object",
          required: ["text"],
          additionalProperties: false,
          properties: { text: { type: "string", minLength: 1 } },
        },
      },
      {
        name: "image",
        requiredSlots: ["image"],
        contentSchema: {
          type: "object",
          additionalProperties: false,
          properties: { caption: { type: "string" } },
        },
      },
    ]);
  });
});

describe("what a config may leave out", () => {
  it("defaults the pool path, the port and every list", () => {
    const config = parse("");

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(defaultPoolPath());
    // No mirror table is the mirror off, rather than one at a guessed path.
    expect(config.mirror).toBeUndefined();
    // Assets are not optional, so their absence is a default rather than an off switch.
    expect(config.assets.root).toBe(defaultAssetRoot());
    expect(config.poolConfig).toMatchObject({
      sources: [],
      payloadTypes: [],
      enrichments: [],
      retry: { maxAttempts: 5 },
    });
  });

  it("takes a payload type with no requiredSlots as one with none", () => {
    const config = parse(`
      [[payloadTypes]]
      name = "text"
      [payloadTypes.contentSchema]
      type = "object"
    `);

    expect(config.poolConfig.payloadTypes[0]?.requiredSlots).toEqual([]);
  });
});

describe("destinations", () => {
  it("resolves the root and takes every payload type when told none", () => {
    const config = parse(`
      [[payloadTypes]]
      name = "text"
      [payloadTypes.contentSchema]
      type = "object"

      [[payloadTypes]]
      name = "image"
      [payloadTypes.contentSchema]
      type = "object"

      [[destinations]]
      id = "vault"
      kind = "filesystem"
      root = "~/notes"
    `);

    expect(config.destinations).toEqual([
      {
        id: "vault",
        kind: "filesystem",
        root: join(homedir(), "notes"),
        accepts: ["text", "image"],
      },
    ]);
  });

  it("narrows to the types it was told, where it was told some", () => {
    const config = parse(`
      [[destinations]]
      id = "vault"
      kind = "filesystem"
      root = "/tmp/vault"
      accepts = ["text"]
    `);

    expect(config.destinations[0]?.accepts).toEqual(["text"]);
  });

  it("refuses a kind no adapter answers to, rather than skipping it", () => {
    expect(() =>
      parse(`
        [[destinations]]
        id = "vault"
        kind = "webdav"
        root = "/tmp/vault"
      `),
    ).toThrow(/kind/);
  });

  it("refuses a destination with no root", () => {
    expect(() =>
      parse(`
        [[destinations]]
        id = "vault"
        kind = "filesystem"
      `),
    ).toThrow(/root/);
  });
});

describe("a config the daemon will not run on", () => {
  it("names the file when it is not TOML", () => {
    expect(() => parse("[daemon")).toThrow(/test\.toml is not valid TOML/);
  });

  it("names the key it did not expect", () => {
    expect(() => parse(`[daemon]\nprot = 4747`)).toThrow(/daemon.*prot/s);
  });

  it("refuses a port that is not one", () => {
    expect(() => parse(`[daemon]\nport = 70000`)).toThrow(/port/);
  });

  it("refuses a payload type with no schema", () => {
    expect(() => parse(`[[payloadTypes]]\nname = "text"`)).toThrow(
      /contentSchema/,
    );
  });
});

describe("where the daemon looks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults the mirror's cadence but never its root", () => {
    const config = parse('[mirror]\nroot = "/tmp/pool-mirror"\n');

    expect(config.mirror).toEqual({
      root: "/tmp/pool-mirror",
      pollIntervalMs: 1000,
      leaseForMs: 60_000,
      batch: 16,
    });
  });

  it("refuses a mirror table with no root, rather than guessing one", () => {
    expect(() => parse("[mirror]\npollInterval = 500\n")).toThrow(/root/);
  });

  it("follows the XDG variables when they are set", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    vi.stubEnv("XDG_DATA_HOME", "/xdg/data");

    expect(defaultConfigPath()).toBe("/xdg/config/notemap/config.toml");
    expect(defaultPoolPath()).toBe("/xdg/data/notemap/state/notemap.db");
  });

  it("falls back to the standard directories when they are not", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "");
    vi.stubEnv("XDG_DATA_HOME", "");

    expect(defaultConfigPath()).toBe(
      join(homedir(), ".config/notemap/config.toml"),
    );
    expect(defaultPoolPath()).toBe(
      join(homedir(), ".local/share/notemap/state/notemap.db"),
    );
  });

  it("ignores an XDG variable that is not an absolute path, as the spec says to", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "relative/config");

    expect(defaultConfigPath()).toBe(
      join(homedir(), ".config/notemap/config.toml"),
    );
  });
});
