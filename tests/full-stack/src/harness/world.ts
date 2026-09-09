import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANUAL = "web-manual";
export const IMAGE_SOURCE = "web-image";

/**
 * What the two destinations are called. Names rather than ids: a destination is
 * a row a person creates, so the id is minted and `vaults()` answers with it.
 */
export const UP = "vault-up";
export const DOWN = "vault-down";

/** Fast enough that a test waits milliseconds for a runner, not seconds. */
const POLL = 25;

/** What a test varies about a world. Everything else is the same every time. */
export type Told = {
  /**
   * Where a browser would reach this daemon. Absent is the loopback default,
   * and what it decides is the session cookie's `Secure` and `__Host-`.
   */
  readonly origin?: string;
};

export type World = {
  readonly directory: string;
  readonly config: string;
  readonly pool: string;
  readonly auth: string;
  readonly assets: string;
  readonly mirror: string;
  readonly up: string;
  readonly down: string;
  readonly port: number;
  /** Everything a daemon over this world left on disk. */
  readonly remove: () => void;
};

const DEFAULT_PORT = 4748;

const ENV = fileURLToPath(new URL("../../../../.env", import.meta.url));

/**
 * Beside the daemon's own 4747, so a suite run never fights the daemon `pnpm
 * dev` left running. The shell wins over the `.env`, which wins over this.
 */
export function port(): number {
  const set = process.env["NOTEMAP_TEST_PORT"];
  if (set !== undefined) return Number(set);

  try {
    process.loadEnvFile(ENV);
  } catch {
    // No `.env` at all is the ordinary case, and the default answers for it.
  }

  return Number(process.env["NOTEMAP_TEST_PORT"] ?? DEFAULT_PORT);
}

/**
 * The directories a host lays out, and the config file naming them. A world
 * outlives the daemon over it, so a restart comes back to the same pool.
 */
export function world(told: Told = {}): World {
  const directory = mkdtempSync(join(tmpdir(), "notemap-full-stack-"));
  const at = (name: string) => join(directory, name);
  const paths = {
    config: at("config.toml"),
    pool: at("state/pool.db"),
    // Named rather than defaulted: the fallback is the developer's own auth
    // database, and a password set on that machine turns this suite into 401s.
    auth: at("state/auth.db"),
    assets: at("assets"),
    mirror: at("pool-mirror"),
    up: at("vault-up"),
    down: at("vault-down"),
  };

  mkdirSync(join(directory, "state"), { recursive: true });
  mkdirSync(paths.up, { recursive: true });
  writeFileSync(paths.config, configFor(paths, port(), told), "utf8");

  return {
    directory,
    ...paths,
    port: port(),
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function configFor(
  paths: {
    pool: string;
    auth: string;
    assets: string;
    mirror: string;
  },
  at: number,
  told: Told,
): string {
  return `[daemon]
pool = "${paths.pool}"
auth = "${paths.auth}"
host = "127.0.0.1"
port = ${at}
${told.origin === undefined ? "" : `origin = "${told.origin}"\n`}
[mirror]
root = "${paths.mirror}"
pollInterval = ${POLL}
leaseFor = 60000
batch = 16

[assets]
root = "${paths.assets}"

[sweep]
grace = 86400000
interval = 3600000

[delivery]
pollInterval = ${POLL}
leaseFor = 300000
batch = 4
`;
}
