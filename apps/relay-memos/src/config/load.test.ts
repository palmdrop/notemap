import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig, readSecret } from "./load";

const MINIMAL = `
[memos]
url = "https://memos.example.com"
tokenFile = "/secrets/memos"

[pool]
tokenEnv = "POOL_TOKEN"
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
  it("defaults the pool, the source and the interval, and keeps both secrets", () => {
    const config = parseConfig(MINIMAL, "relay.toml");

    expect(config).toEqual({
      pool: {
        url: "http://127.0.0.1:4747",
        token: { env: "POOL_TOKEN" },
        source: "memos",
      },
      memos: {
        url: "https://memos.example.com",
        token: { file: "/secrets/memos" },
      },
      poll: { intervalMs: 300_000 },
    });
  });

  it("drops a trailing slash from both addresses, which every route adds back", () => {
    const config = parseConfig(
      `[memos]
url = "https://memos.example.com/"
tokenFile = "/secrets/memos"

[pool]
url = "http://box:4747/"
tokenEnv = "POOL_TOKEN"
`,
      "relay.toml",
    );

    expect(config.pool.url).toBe("http://box:4747");
    expect(config.memos.url).toBe("https://memos.example.com");
  });

  it("refuses a token written into the file itself", () => {
    expect(() =>
      parseConfig(
        `[memos]\nurl = "https://memos.example.com"\ntoken = "abc"\n\n[pool]\ntokenEnv = "POOL_TOKEN"\n`,
        "relay.toml",
      ),
    ).toThrow(/sets token inline/);
  });

  it("refuses both a file and an environment variable, and neither", () => {
    expect(() =>
      parseConfig(
        `[memos]\nurl = "https://m.example.com"\ntokenFile = "/a"\ntokenEnv = "B"\n[pool]\ntokenEnv = "P"\n`,
        "relay.toml",
      ),
    ).toThrow(/exactly one of tokenFile and tokenEnv/);

    expect(() =>
      parseConfig(`[memos]\nurl = "https://m.example.com"\n`, "relay.toml"),
    ).toThrow(/exactly one of tokenFile and tokenEnv/);
  });

  it("refuses a key it does not know, which in a file this size is a typo", () => {
    expect(() =>
      parseConfig(`${MINIMAL}\n[poll]\ninterval_ms = 1000\n`, "relay.toml"),
    ).toThrow(/is not a memos relay config/);
  });

  it("names the file when it is not TOML at all", () => {
    expect(() => parseConfig("not = = toml", "relay.toml")).toThrow(
      /relay.toml is not valid TOML/,
    );
  });
});

describe("reading a secret", () => {
  it("takes the file's contents, without the newline an editor leaves", () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-memos-"));
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
    set("POOL_TOKEN", "from-the-env");
    expect(readSecret({ env: "POOL_TOKEN" }, "the pool token")).toBe(
      "from-the-env",
    );

    expect(() => readSecret({ env: "NOT_SET" }, "the pool token")).toThrow(
      /read from NOT_SET, which is not set/,
    );
  });
});
