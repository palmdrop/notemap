import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig, readSecret } from "./load";

const MINIMAL = `
[arena]
tokenFile = "/secrets/arena"

[pool]
tokenEnv = "POOL_TOKEN"

[[channel]]
handle = "influences"
source = "arena/influences"
`;

const held = new Set<string>();

afterEach(() => {
  for (const name of held) delete process.env[name];
  held.clear();
});

function set(name: string, value: string): void {
  process.env[name] = value;
  held.add(name);
}

describe("the config a relay is pointed with", () => {
  it("defaults the pool url and the interval, and keeps both secrets", () => {
    const config = parseConfig(MINIMAL, "relay.toml");

    expect(config).toEqual({
      pool: { url: "http://127.0.0.1:4747", token: { env: "POOL_TOKEN" } },
      arena: { token: { file: "/secrets/arena" } },
      channels: [
        { handle: "influences", source: "arena/influences", tags: [] },
      ],
      poll: { intervalMs: 900_000 },
    });
  });

  it("reads one or more channels, each with its own handle, source and tags", () => {
    const config = parseConfig(
      `${MINIMAL}
[[channel]]
handle = "9530"
source = "arena/adam-curtis"
tags = ["kind/reference"]
`,
      "relay.toml",
    );

    expect(config.channels).toEqual([
      { handle: "influences", source: "arena/influences", tags: [] },
      {
        handle: "9530",
        source: "arena/adam-curtis",
        tags: ["kind/reference"],
      },
    ]);
  });

  it("drops a trailing slash from the pool address, which every route adds back", () => {
    const config = parseConfig(
      `[arena]
tokenFile = "/secrets/arena"

[pool]
url = "http://box:4747/"
tokenEnv = "POOL_TOKEN"

[[channel]]
handle = "influences"
source = "arena/influences"
`,
      "relay.toml",
    );

    expect(config.pool.url).toBe("http://box:4747");
  });

  it("refuses a config with no [[channel]] at all", () => {
    expect(() =>
      parseConfig(
        `[arena]\ntokenFile = "/secrets/arena"\n[pool]\ntokenEnv = "P"\n`,
        "relay.toml",
      ),
    ).toThrow(/configures no \[\[channel\]\] to watch/);
  });

  it("refuses two channels under one source: it would merge their blocks into one identity", () => {
    expect(() =>
      parseConfig(
        `${MINIMAL}
[[channel]]
handle = "another-channel"
source = "arena/influences"
`,
        "relay.toml",
      ),
    ).toThrow(
      /source "arena\/influences" is configured for more than one channel/,
    );
  });

  it("refuses the same handle configured twice", () => {
    expect(() =>
      parseConfig(
        `${MINIMAL}
[[channel]]
handle = "influences"
source = "arena/influences-2"
`,
        "relay.toml",
      ),
    ).toThrow(/channel "influences" is configured more than once/);
  });

  it("refuses a token written into the file itself", () => {
    expect(() =>
      parseConfig(
        `[arena]\ntoken = "abc"\n[pool]\ntokenEnv = "P"\n[[channel]]\nhandle = "a"\nsource = "s"\n`,
        "relay.toml",
      ),
    ).toThrow(/sets token inline/);
  });

  it("refuses both a file and an environment variable, and neither, for the arena token", () => {
    expect(() =>
      parseConfig(
        `[arena]\ntokenFile = "/a"\ntokenEnv = "B"\n[pool]\ntokenEnv = "P"\n[[channel]]\nhandle = "a"\nsource = "s"\n`,
        "relay.toml",
      ),
    ).toThrow(/exactly one of tokenFile and tokenEnv/);

    expect(() =>
      parseConfig(
        `[arena]\n[pool]\ntokenEnv = "P"\n[[channel]]\nhandle = "a"\nsource = "s"\n`,
        "relay.toml",
      ),
    ).toThrow(/exactly one of tokenFile and tokenEnv/);
  });

  it("refuses a key it does not know, which in a file this size is a typo", () => {
    expect(() =>
      parseConfig(`${MINIMAL}\n[poll]\ninterval_ms = 1000\n`, "relay.toml"),
    ).toThrow(/is not an arena relay config/);
  });

  it("refuses an [arena] url: are.na's address is a constant of the service", () => {
    expect(() =>
      parseConfig(
        `[arena]\nurl = "https://api.are.na"\ntokenFile = "/a"\n[pool]\ntokenEnv = "P"\n[[channel]]\nhandle = "a"\nsource = "s"\n`,
        "relay.toml",
      ),
    ).toThrow(/is not an arena relay config/);
  });

  it("names the file when it is not TOML at all", () => {
    expect(() => parseConfig("not = = toml", "relay.toml")).toThrow(
      /relay.toml is not valid TOML/,
    );
  });
});

describe("reading a secret", () => {
  it("takes the file's contents, without the newline an editor leaves", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-arena-"));
    const file = join(directory, "token");
    writeFileSync(file, "sekrit\n", "utf8");

    expect(readSecret({ file }, "the pool token")).toBe("sekrit");
  });

  it("says which file it could not read, rather than what fs calls it", () => {
    expect(() =>
      readSecret({ file: "/nowhere/token" }, "the pool token"),
    ).toThrow(/the pool token cannot be read from \/nowhere\/token/);
  });

  it("takes an environment variable, and says so when it is not set", () => {
    set("ARENA_TOKEN", "from-the-env");
    expect(readSecret({ env: "ARENA_TOKEN" }, "the arena token")).toBe(
      "from-the-env",
    );

    expect(() => readSecret({ env: "NOT_SET" }, "the arena token")).toThrow(
      /read from NOT_SET, which is not set/,
    );
  });
});
