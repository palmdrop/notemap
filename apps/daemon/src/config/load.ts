import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { PAYLOAD_TYPES } from "@notemap/core";
import type { Duration, JsonObject, PoolConfig } from "@notemap/core";

import {
  DEFAULT_DELIVERY,
  DEFAULT_HOST,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_MIRROR,
  DEFAULT_PORT,
  DEFAULT_RETRY,
  DEFAULT_SWEEP,
  DEFAULT_TRIGGER_WINDOW_MS,
  defaultZone,
} from "../constants";
import type { CookieOptions } from "../auth/sessions/config";
import {
  DEFAULT_LOG,
  LOG_FORMATS,
  LOG_LEVELS,
  LOG_LEVEL_VARIABLE,
  isLogLevel,
  type LogConfig,
} from "../log/config";

export type MirrorConfig = {
  /** The `pool-mirror` directory. */
  readonly root: string;
  readonly pollIntervalMs: number;
  readonly leaseForMs: Duration;
  readonly batch: number;
};

export type AssetsConfig = {
  /** The `assets` directory. Not optional: a pool that cannot store bytes cannot capture an image. */
  readonly root: string;
  /** Enforced against the stream, because `Content-Length` is a claim. */
  readonly maxUploadBytes: number;
};

export type SweepConfig = {
  readonly intervalMs: number;
};

/**
 * One account a credential-holding destination kind may be pointed at, as its
 * block was written. What an account of a given kind must carry beyond a kind
 * and a name is that kind's own, declared by its adapter and checked against
 * that schema when the daemon starts; nothing here knows an address from a
 * username. An address travels with the secret rather than being a
 * destination's field, so nothing created over `/v1` can aim the daemon
 * somewhere else with the credential attached.
 */
export type Account = JsonObject & {
  /** The destination kind that speaks to it, which is how an adapter finds its own. */
  readonly kind: string;
  readonly name: string;
};

export type DaemonConfig = {
  /** The SQLite file the pool lives in. */
  readonly pool: string;
  readonly auth: string;
  readonly host: string;
  readonly port: number;
  /**
   * Where a browser reaches this daemon. Required once it binds beyond
   * loopback, because nothing else says whether a session cookie may travel
   * over plain HTTP.
   */
  readonly origin?: string;
  /** Absent turns the mirror off: nothing is written and no job is enqueued. */
  readonly mirror?: MirrorConfig;
  readonly assets: AssetsConfig;
  readonly sweep: SweepConfig;
  /** The cadence the delivery runner claims at. Destinations are pool state, not this file's. */
  readonly delivery: DeliveryConfig;
  /** The accounts a destination may name, by kind. Empty is a daemon with nothing remote to reach. */
  readonly accounts: readonly Account[];
  readonly log: LogConfig;
  readonly poolConfig: PoolConfig;
};

export type DeliveryConfig = {
  readonly pollIntervalMs: number;
  readonly leaseForMs: Duration;
  readonly batch: number;
};

const fileSchema = z.object({
  daemon: z
    .object({
      pool: z.string().optional(),
      auth: z.string().optional(),
      host: z.string().min(1).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      origin: z.string().url().optional(),
    })
    .optional(),
  mirror: z
    .object({
      root: z.string().min(1),
      pollInterval: z.number().int().positive().optional(),
      leaseFor: z.number().int().positive().optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().positive(),
      initialBackoff: z.number().int().nonnegative(),
      maxBackoff: z.number().int().nonnegative(),
    })
    .optional(),
  assets: z
    .object({
      root: z.string().min(1).optional(),
      maxUpload: z.number().int().positive().optional(),
    })
    .optional(),
  sweep: z
    .object({
      grace: z.number().int().nonnegative().optional(),
      interval: z.number().int().positive().optional(),
    })
    .optional(),
  capture: z
    .object({
      zone: z.string().min(1).optional(),
    })
    .optional(),
  routing: z
    .object({
      triggerWindow: z.number().int().nonnegative().optional(),
    })
    .optional(),
  delivery: z
    .object({
      pollInterval: z.number().int().positive().optional(),
      leaseFor: z.number().int().positive().optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
  log: z
    .object({
      level: z.enum(LOG_LEVELS).optional(),
      format: z.enum(LOG_FORMATS).optional(),
    })
    .optional(),
  // Everything past `kind` and `name` is the kind's, so nothing is stripped
  // here: a key this file dropped would be a key the kind's own schema never
  // sees, and the daemon would start with a credential nobody checked.
  accounts: z
    .array(
      z.looseObject({
        kind: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .default([]),
});

/**
 * `0.0.0.0` and `::` are not loopback: they are every interface, which is the
 * accidental exposure this tells apart from a daemon on someone's laptop.
 */
export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * The two the origin decides, which are not the same question. A browser counts
 * loopback as trustworthy whatever the scheme, so `Secure` survives plain HTTP
 * there and only a plain-HTTP origin someone else can reach gives it up. The
 * `__Host-` prefix is stricter than that in Chromium, which rejects a prefixed
 * cookie outright over `http:` — loopback included — so the prefix follows the
 * scheme alone. An absent origin is the loopback daemon nobody configured.
 */
export function cookieOptionsFor(origin: string | undefined): CookieOptions {
  if (origin === undefined) return { secure: true, prefixed: false };

  const url = new URL(origin);
  const https = url.protocol === "https:";

  return { secure: https || isLoopback(url.hostname), prefixed: https };
}

/** The name in a `Host` header, which carries a port and may be bracketed. */
function hostnameIn(header: string): string | undefined {
  try {
    return new URL(`http://${header}`).hostname.replace(/^\[|]$/g, "");
  } catch {
    return undefined;
  }
}

/**
 * Whether a request arrived somewhere the cookie rules were not decided from.
 * The bind address cannot answer this — a tunnel or a proxy carries a daemon
 * bound to loopback to a name a browser sees instead, and the cookie the
 * browser then drops is the whole of the symptom.
 */
export function reachedElsewhere(
  arrivedFor: string | undefined,
  origin: string | undefined,
): boolean {
  if (arrivedFor === undefined) return false;

  const host = hostnameIn(arrivedFor);
  if (host === undefined) return false;

  return origin === undefined
    ? !isLoopback(host)
    : host !== new URL(origin).hostname;
}

/** `~` is the shell's, not the filesystem's. */
function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? join(homedir(), path.slice(1))
    : path;
}

function xdg(variable: string, fallback: string): string {
  const configured = process.env[variable];
  return configured && isAbsolute(configured)
    ? configured
    : join(homedir(), fallback);
}

export function defaultConfigPath(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "notemap", "config.toml");
}

/**
 * The backup unit: the database, the mirror and the assets are siblings under
 * one directory, so "back up notemap" names something real.
 */
export function defaultDataRoot(): string {
  return join(xdg("XDG_DATA_HOME", ".local/share"), "notemap");
}

export function defaultPoolPath(): string {
  return join(defaultDataRoot(), "state", "notemap.db");
}

export function defaultMirrorRoot(): string {
  return join(defaultDataRoot(), "pool-mirror");
}

export function defaultAssetRoot(): string {
  return join(defaultDataRoot(), "assets");
}

export function defaultAuthPath(): string {
  return join(defaultDataRoot(), "state", "auth.db");
}

/** The config, and every key the daemon did not know and ignored. */
export type LoadedConfig = {
  readonly config: DaemonConfig;
  /** Every key that was dropped, by name. */
  readonly warnings: readonly string[];
};

type ConfigFile = z.infer<typeof fileSchema>;

/**
 * The schema strips what it does not know; what was stripped is read off the
 * parse rather than off a second list of keys, which would drift from it.
 */
function tolerate(
  raw: unknown,
  from: string,
): { file: ConfigFile; stripped: readonly string[] } {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${from} is not a notemap config: ${where}`);
  }

  return { file: parsed.data, stripped: droppedKeys(raw, parsed.data) };
}

/** Every key in `raw` that `kept` no longer has, by its whole path. */
function droppedKeys(raw: unknown, kept: unknown, at: string[] = []): string[] {
  if (Array.isArray(raw) && Array.isArray(kept)) {
    return raw.flatMap((each, index) =>
      index < kept.length
        ? droppedKeys(each, kept[index], [...at, String(index)])
        : [],
    );
  }

  if (!isTable(raw) || !isTable(kept)) return [];

  return Object.entries(raw).flatMap(([key, value]) =>
    key in kept
      ? droppedKeys(value, kept[key], [...at, key])
      : [[...at, key].join(".")],
  );
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What makes the file itself wrong is refused here, at load: a password written
 * into a file people keep in dotfiles, two accounts a destination could not
 * tell apart, an address that is not one this speaks. Whether an account can be
 * used *safely* is asked when it is resolved instead, so one bad account does
 * not take the daemon down with it.
 */
function readAccounts(
  accounts: NonNullable<ConfigFile["accounts"]>,
  from: string,
): readonly Account[] {
  const seen = new Set<string>();

  return accounts.map((account) => {
    const at = `${from}: the ${account.kind} account ${account.name}`;

    const inline = INLINE_SECRETS.filter((key) => account[key] !== undefined);
    if (inline.length > 0) {
      throw new Error(
        `${at} sets ${inline[0]} inline, which puts a secret in a file that is backed up and pasted into issues. Use ${inline[0]}File or ${inline[0]}Env.`,
      );
    }

    const sources = Object.keys(account).filter(isSecretSource);
    if (sources.length !== 1) {
      throw new Error(
        `${at} must say where its secret is read from, in exactly one key ending in File or Env`,
      );
    }

    if (seen.has(`${account.kind}\u0000${account.name}`)) {
      throw new Error(
        `${at} is declared twice, and a destination of that kind names one by name`,
      );
    }
    seen.add(`${account.kind}\u0000${account.name}`);

    const source = sources[0] as string;
    const held = account[source];
    if (typeof held !== "string" || held === "") {
      throw new Error(
        `${at} sets ${source} to something that is not a path or a variable name`,
      );
    }

    return {
      ...account,
      // `~` and a relative path mean here what they mean for every other path
      // in this file: a secret named `~/.config/…` is the one in a home
      // directory, not a directory called `~` beside the daemon.
      [source]: source.endsWith(FILE) ? resolve(expandHome(held)) : held,
    } as Account;
  });
}

/**
 * A key naming where a secret is read from, whatever the kind calls the secret
 * — `passwordFile` for a login, `secretEnv` for a bearer token. The suffix is
 * the whole of the convention: which word precedes it is the kind's, and this
 * file has no business knowing it.
 */
const FILE = "File";
const ENV = "Env";

/** A stem is required either side of the suffix, so the bare words are not sources. */
export function isSecretSource(key: string): boolean {
  if (key.endsWith(FILE)) return key.length > FILE.length;
  return key.endsWith(ENV) && key.length > ENV.length;
}

/**
 * The stems, spelt bare. Known so one can be refused by name rather than
 * carried along as a key some kind's schema will reject in different words —
 * the point is to say *why* it is wrong, not only that it is.
 */
const INLINE_SECRETS: readonly string[] = [
  "password",
  "secret",
  "token",
  "apiKey",
];

/**
 * Refused here rather than at the first capture that needs it: a zone nobody
 * has heard of is a typo in a config file, and finding out weeks later means a
 * date read in the wrong place.
 */
function readZone(named: string | undefined, from: string): string {
  const zone = named ?? defaultZone();
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  } catch {
    throw new Error(
      `${from} names capture.zone = "${zone}", which is not an IANA time zone`,
    );
  }
  return zone;
}

export function parseConfig(source: string, from: string): LoadedConfig {
  let raw: unknown;
  try {
    raw = parseToml(source);
  } catch (cause) {
    throw new Error(`${from} is not valid TOML: ${String(cause)}`, { cause });
  }

  const { file, stripped } = tolerate(raw, from);
  const retry = file.retry ?? DEFAULT_RETRY;

  const host = file.daemon?.host ?? DEFAULT_HOST;
  const origin = file.daemon?.origin;

  if (!isLoopback(host) && origin === undefined) {
    throw new Error(
      `${from} binds ${host}, which is reachable from beyond this machine, so daemon.origin must say where — a session cookie has no other way to know whether it may travel over plain HTTP`,
    );
  }

  const config: DaemonConfig = {
    pool: resolve(expandHome(file.daemon?.pool ?? defaultPoolPath())),
    auth: resolve(expandHome(file.daemon?.auth ?? defaultAuthPath())),
    host,
    port: file.daemon?.port ?? DEFAULT_PORT,
    ...(origin === undefined ? {} : { origin }),
    ...(file.mirror === undefined
      ? {}
      : {
          mirror: {
            root: resolve(expandHome(file.mirror.root)),
            pollIntervalMs: file.mirror.pollInterval ?? DEFAULT_MIRROR.pollMs,
            leaseForMs: (file.mirror.leaseFor ??
              DEFAULT_MIRROR.leaseMs) as Duration,
            batch: file.mirror.batch ?? DEFAULT_MIRROR.batch,
          },
        }),
    assets: {
      root: resolve(expandHome(file.assets?.root ?? defaultAssetRoot())),
      maxUploadBytes: file.assets?.maxUpload ?? DEFAULT_MAX_UPLOAD_BYTES,
    },
    sweep: { intervalMs: file.sweep?.interval ?? DEFAULT_SWEEP.intervalMs },
    delivery: {
      pollIntervalMs: file.delivery?.pollInterval ?? DEFAULT_DELIVERY.pollMs,
      leaseForMs: (file.delivery?.leaseFor ??
        DEFAULT_DELIVERY.leaseMs) as Duration,
      batch: file.delivery?.batch ?? DEFAULT_DELIVERY.batch,
    },
    accounts: readAccounts(file.accounts, from),
    log: {
      level: file.log?.level ?? DEFAULT_LOG.level,
      format: file.log?.format ?? DEFAULT_LOG.format,
    },
    poolConfig: {
      payloadTypes: PAYLOAD_TYPES,
      retry: {
        maxAttempts: retry.maxAttempts,
        initialBackoff: retry.initialBackoff as Duration,
        maxBackoff: retry.maxBackoff as Duration,
      },
      sweep: {
        grace: (file.sweep?.grace ?? DEFAULT_SWEEP.graceMs) as Duration,
      },
      zone: readZone(file.capture?.zone, from),
      triggerWindow: (file.routing?.triggerWindow ??
        DEFAULT_TRIGGER_WINDOW_MS) as Duration,
    },
  };

  return { config, warnings: stripped };
}

export function loadConfig(
  path = process.env["NOTEMAP_CONFIG"] || defaultConfigPath(),
  env: NodeJS.ProcessEnv = process.env,
): LoadedConfig {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `no config at ${path}. Copy config.example.toml there, or pass --config <path>.`,
      { cause },
    );
  }
  return withEnvironment(parseConfig(source, path), env);
}

/**
 * The one setting the environment may override: a container is easier to turn
 * up to `debug` from its compose file than by editing the config inside it.
 */
export function withEnvironment(
  loaded: LoadedConfig,
  env: NodeJS.ProcessEnv,
): LoadedConfig {
  const level = env[LOG_LEVEL_VARIABLE];
  if (level === undefined || level === "") return loaded;

  if (!isLogLevel(level)) {
    throw new Error(
      `${LOG_LEVEL_VARIABLE} is "${level}", and a level is one of ${LOG_LEVELS.join(", ")}`,
    );
  }

  return {
    ...loaded,
    config: { ...loaded.config, log: { ...loaded.config.log, level } },
  };
}
