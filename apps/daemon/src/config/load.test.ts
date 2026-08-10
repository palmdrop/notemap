import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfigPath, defaultPoolPath, parseConfig } from "./load";

const EXAMPLE = fileURLToPath(
  new URL("../../config.example.toml", import.meta.url),
);

const parse = (source: string) => parseConfig(source, "test.toml");

describe("the example config", () => {
  it("is a config this daemon can load", () => {
    const config = parse(readFileSync(EXAMPLE, "utf8"));

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(join(homedir(), ".local/share/notemap/pool.db"));
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
    ]);
  });
});

describe("what a config may leave out", () => {
  it("defaults the pool path, the port and every list", () => {
    const config = parse("");

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(defaultPoolPath());
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

  it("follows the XDG variables when they are set", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    vi.stubEnv("XDG_DATA_HOME", "/xdg/data");

    expect(defaultConfigPath()).toBe("/xdg/config/notemap/config.toml");
    expect(defaultPoolPath()).toBe("/xdg/data/notemap/pool.db");
  });

  it("falls back to the standard directories when they are not", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "");
    vi.stubEnv("XDG_DATA_HOME", "");

    expect(defaultConfigPath()).toBe(
      join(homedir(), ".config/notemap/config.toml"),
    );
    expect(defaultPoolPath()).toBe(
      join(homedir(), ".local/share/notemap/pool.db"),
    );
  });

  it("ignores an XDG variable that is not an absolute path, as the spec says to", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "relative/config");

    expect(defaultConfigPath()).toBe(
      join(homedir(), ".config/notemap/config.toml"),
    );
  });
});
