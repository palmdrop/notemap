import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cookieOptionsFor,
  defaultAssetRoot,
  defaultAuthPath,
  defaultConfigPath,
  defaultPoolPath,
  loadConfig,
  parseConfig,
} from "./load";

const EXAMPLE = fileURLToPath(
  new URL("../../config.example.toml", import.meta.url),
);

/** The file the compose files mount, which is a deployment rather than an example. */
const CONTAINER = fileURLToPath(
  new URL("../../../../docker/compose/config.toml", import.meta.url),
);

const parse = (source: string) => parseConfig(source, "test.toml").config;

/** What the daemon ignored, which is a warning rather than a refusal. */
const ignored = (source: string) => parseConfig(source, "test.toml").warnings;

describe("the example config", () => {
  it("is a config this daemon can load", () => {
    const config = parse(readFileSync(EXAMPLE, "utf8"));

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(
      join(homedir(), ".local/share/notemap/state/notemap.db"),
    );
    expect(config.auth).toBe(
      join(homedir(), ".local/share/notemap/state/auth.db"),
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
    expect(config.poolConfig.sweep).toEqual({ grace: 86_400_000 });
    expect(config.poolConfig.sources).toEqual([
      { id: "web-manual", autoRequest: [] },
      { id: "web-image", autoRequest: [] },
    ]);
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

describe("the container config", () => {
  it("is a config this daemon can load", () => {
    const { config, warnings } = parseConfig(
      readFileSync(CONTAINER, "utf8"),
      "container.toml",
    );

    expect(warnings).toEqual([]);
    expect(config.port).toBe(4747);
    // Every interface: a container that binds loopback is reachable from nothing.
    expect(config.host).toBe("0.0.0.0");
    expect(config.pool).toBe("/var/lib/notemap/state/notemap.db");
    expect(config.auth).toBe("/var/lib/notemap/state/auth.db");
    expect(config.mirror?.root).toBe("/var/lib/notemap/pool-mirror");
    expect(config.assets.root).toBe("/var/lib/notemap/assets");
    expect(config.delivery).toEqual({
      pollIntervalMs: 5_000,
      leaseForMs: 300_000,
      batch: 4,
    });
    expect(config.poolConfig.sources.map((source) => source.id)).toEqual([
      "web-manual",
      "web-image",
    ]);
    expect(config.poolConfig.payloadTypes.map((type) => type.name)).toEqual([
      "text",
      "image",
    ]);
  });

  /**
   * The pool, the mirror and the assets are one backup unit, so one volume holds
   * all three. The auth database is not part of that unit and is here for a
   * different reason: off the volume, every restart is a daemon nobody has a
   * password for.
   */
  it("keeps every path it writes under the volume", () => {
    const { config } = parseConfig(
      readFileSync(CONTAINER, "utf8"),
      "container.toml",
    );

    for (const path of [
      config.pool,
      config.auth,
      config.mirror?.root,
      config.assets.root,
    ]) {
      expect(path).toMatch(/^\/var\/lib\/notemap\//);
    }
  });

  it("declares no destinations, which are pool state rather than config", () => {
    expect(readFileSync(CONTAINER, "utf8")).not.toMatch(
      /^\[\[destinations\]\]/m,
    );
  });
});

describe("what a config may leave out", () => {
  it("defaults the pool path, the port and every list", () => {
    const config = parse("");

    expect(config.port).toBe(4747);
    expect(config.pool).toBe(defaultPoolPath());
    expect(config.auth).toBe(defaultAuthPath());
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

/**
 * An upgrade or a downgrade must never leave the daemon unable to start over a
 * block it does not know, and a stale `[[destinations]]` is now exactly that:
 * destinations moved into the pool, and this file no longer describes them.
 */
describe("a key this daemon does not know", () => {
  it("is ignored, and named so a person can find it", () => {
    const source = `
      [[destinations]]
      id = "vault"
      kind = "filesystem"
      root = "~/notes"
    `;

    expect(ignored(source)).toEqual(["destinations"]);
    expect(parse(source).port).toBe(4747);
  });

  it("names it by its whole path, table and all", () => {
    expect(ignored(`[daemon]\nprot = 4747`)).toEqual(["daemon.prot"]);
    expect(ignored(`[mirror]\nroot = "/tmp/m"\nsweep = 1`)).toEqual([
      "mirror.sweep",
    ]);
  });

  it("names one inside a list, by the entry it was in", () => {
    expect(ignored(`[[sources]]\nid = "web"\nautoTag = ["a"]`)).toEqual([
      "sources.0.autoTag",
    ]);
  });

  it("names every one of them, rather than stopping at the first", () => {
    expect(ignored(`[daemon]\nprot = 1\nhostname = "x"`)).toEqual([
      "daemon.prot",
      "daemon.hostname",
    ]);
  });

  /** A schema is open JSON, so nothing in one is a key this daemon could know. */
  it("leaves a payload type's content schema alone", () => {
    const source = `
      [[payloadTypes]]
      name = "text"
      [payloadTypes.contentSchema]
      type = "object"
      [payloadTypes.contentSchema.properties.text]
      type = "string"
    `;

    expect(ignored(source)).toEqual([]);
    expect(parse(source).poolConfig.payloadTypes[0]?.contentSchema).toEqual({
      type: "object",
      properties: { text: { type: "string" } },
    });
  });

  it("says nothing about a file it understood entirely", () => {
    expect(ignored(readFileSync(EXAMPLE, "utf8"))).toEqual([]);
  });
});

describe("a config the daemon will not run on", () => {
  it("names the file when it is not TOML", () => {
    expect(() => parse("[daemon")).toThrow(/test\.toml is not valid TOML/);
  });

  /** Dropping it silently would leave a daemon that does not match the file. */
  it("still refuses a key it knows whose value it cannot honour", () => {
    expect(() => parse(`[daemon]\nport = "4747"`)).toThrow(/port/);
  });

  it("refuses that value even where an unknown key sits beside it", () => {
    expect(() => parse(`[daemon]\nprot = 1\nport = 70000`)).toThrow(/port/);
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

  /**
   * `docker compose exec` inherits the image's environment but not its `CMD`,
   * so the variable is what lets a command find the config the daemon is on.
   */
  it("takes the config path from NOTEMAP_CONFIG", () => {
    const directory = mkdtempSync(join(tmpdir(), "notemap-env-"));
    const path = join(directory, "config.toml");
    writeFileSync(path, "[daemon]\nport = 4848\n", "utf8");

    try {
      vi.stubEnv("NOTEMAP_CONFIG", path);

      expect(loadConfig().config.port).toBe(4848);
      // An explicit path outranks it, so a command may name another daemon's.
      expect(() => loadConfig("/nowhere/config.toml")).toThrow(/no config at/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("ignores an empty NOTEMAP_CONFIG, which names nothing", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    vi.stubEnv("NOTEMAP_CONFIG", "");

    // The default, rather than an attempt to read a file called "".
    expect(() => loadConfig()).toThrow(/\/xdg\/config\/notemap\/config.toml/);
  });

  it("follows the XDG variables when they are set", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg/config");
    vi.stubEnv("XDG_DATA_HOME", "/xdg/data");

    expect(defaultConfigPath()).toBe("/xdg/config/notemap/config.toml");
    expect(defaultPoolPath()).toBe("/xdg/data/notemap/state/notemap.db");
    expect(defaultAuthPath()).toBe("/xdg/data/notemap/state/auth.db");
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
    expect(defaultAuthPath()).toBe(
      join(homedir(), ".local/share/notemap/state/auth.db"),
    );
  });

  it("ignores an XDG variable that is not an absolute path, as the spec says to", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "relative/config");

    expect(defaultConfigPath()).toBe(
      join(homedir(), ".config/notemap/config.toml"),
    );
  });
});

describe("where the daemon says it is reachable", () => {
  it("takes a loopback daemon without an origin, as it always has", () => {
    expect(parse(`[daemon]\nhost = "127.0.0.1"`).origin).toBeUndefined();
    expect(parse("").origin).toBeUndefined();
  });

  it("refuses to bind beyond loopback without one", () => {
    // Every interface is the accidental exposure: nothing else in the file says
    // whether a session cookie may cross the network in the clear.
    for (const host of ["0.0.0.0", "::", "192.168.1.10"]) {
      expect(() => parse(`[daemon]\nhost = "${host}"`), host).toThrow(
        "daemon.origin",
      );
    }
  });

  it("takes the same daemon once it says where it is", () => {
    expect(
      parse(`[daemon]\nhost = "0.0.0.0"\norigin = "https://notes.example.com"`)
        .origin,
    ).toBe("https://notes.example.com");
  });

  it("refuses an origin that is not a URL", () => {
    expect(() => parse(`[daemon]\norigin = "notes.example.com"`)).toThrow();
  });
});

describe("what an origin decides about the session cookie", () => {
  it("asks for both of an origin reached over TLS", () => {
    expect(cookieOptionsFor("https://notes.example.com")).toEqual({
      secure: true,
      prefixed: true,
    });
  });

  it("keeps Secure on loopback, which a browser trusts whatever the scheme", () => {
    expect(cookieOptionsFor("http://localhost:4747").secure).toBe(true);
    expect(cookieOptionsFor("http://127.0.0.1:4747").secure).toBe(true);
    expect(cookieOptionsFor(undefined).secure).toBe(true);
  });

  /**
   * The prefix is Chromium's to reject, and it rejects it over `http:` whatever
   * the host — so a loopback daemon that took it would sign nobody in at all.
   */
  it("drops the prefix everywhere but TLS, loopback included", () => {
    expect(cookieOptionsFor("http://localhost:4747").prefixed).toBe(false);
    expect(cookieOptionsFor("http://127.0.0.1:4747").prefixed).toBe(false);
    expect(cookieOptionsFor(undefined).prefixed).toBe(false);
  });

  it("gives Secure up only where plain HTTP crosses a network", () => {
    expect(cookieOptionsFor("http://notes.example.com").secure).toBe(false);
    expect(cookieOptionsFor("http://192.168.1.10:4747").secure).toBe(false);
  });
});
