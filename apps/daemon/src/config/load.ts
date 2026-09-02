import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import type {
  Duration,
  EnrichmentName,
  JsonSchema,
  PayloadTypeName,
  PoolConfig,
  SourceId,
} from "@notemap/core";

import {
  DEFAULT_DELIVERY,
  DEFAULT_HOST,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_MIRROR,
  DEFAULT_PORT,
  DEFAULT_RETRY,
  DEFAULT_SWEEP,
} from "../constants";
import type { CookieOptions } from "../auth/sessions/config";

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
 * One account a credential-holding destination kind may be pointed at: the
 * collection it is rooted in, who is reaching it, and where the secret is read
 * from. The base URL travels with the secret rather than being a destination's
 * field, so nothing created over `/v1` can aim the daemon somewhere else with
 * the credential attached.
 */
export type WebdavProfile = {
  readonly name: string;
  /** The collection the profile is rooted at, without a trailing slash. */
  readonly baseUrl: string;
  readonly username: string;
  /** Exactly one of these two. The secret is read when a delivery needs it. */
  readonly passwordFile?: string;
  readonly passwordEnv?: string;
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
  /** The accounts a webdav destination may name. Empty is a daemon with no vault to reach. */
  readonly webdav: readonly WebdavProfile[];
  readonly poolConfig: PoolConfig;
};

export type DeliveryConfig = {
  readonly pollIntervalMs: number;
  readonly leaseForMs: Duration;
  readonly batch: number;
};

const jsonSchema = z.record(z.string(), z.unknown());

/** Keys are core's own names. Absent lists mean empty. */
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
  delivery: z
    .object({
      pollInterval: z.number().int().positive().optional(),
      leaseFor: z.number().int().positive().optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
  webdav: z
    .array(
      z.object({
        name: z.string().min(1),
        baseUrl: z.string().url(),
        username: z.string().min(1),
        passwordFile: z.string().min(1).optional(),
        passwordEnv: z.string().min(1).optional(),
        // Known so it can be refused by name rather than dropped as an
        // unrecognised key, which would start a daemon with no credential and
        // a warning nobody reads.
        password: z.string().optional(),
      }),
    )
    .default([]),
  sources: z
    .array(
      z.object({
        id: z.string().min(1),
        autoRequest: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  payloadTypes: z
    .array(
      z.object({
        name: z.string().min(1),
        contentSchema: jsonSchema,
        requiredSlots: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  enrichments: z
    .array(
      z.object({
        name: z.string().min(1),
        appliesTo: z.array(z.string()).default([]),
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
 * Somewhere a password cannot cross a network somebody else is on. Loopback is
 * the narrowest case of it and not the ordinary one: a service reached as
 * `nextcloud` on a container network is a single label that resolves nowhere
 * else, and refusing it would refuse the deployment this is written for.
 */
export function isPrivateHost(bracketed: string): boolean {
  // `URL.hostname` hands an IPv6 literal back in the brackets it was written in.
  const host = bracketed.replace(/^\[|]$/g, "");

  if (isLoopback(host)) return true;
  if (host.includes(":")) return isPrivateV6(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateV4(host);
  return !host.includes(".");
}

function isPrivateV4(host: string): boolean {
  const [a, b] = host.split(".").map(Number) as [number, number];

  if (a === 10 || a === 127) return true;
  if (a === 172) return b >= 16 && b <= 31;
  if (a === 192) return b === 168;
  return a === 169 && b === 254;
}

/** Unique-local `fc00::/7` and link-local `fe80::/10`, by the two digits that name them. */
function isPrivateV6(host: string): boolean {
  const address = host.toLowerCase().split("%")[0] ?? "";
  return /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
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
 * into a file people keep in dotfiles, two profiles a destination could not
 * tell apart, an address that is not one this speaks. Whether a profile can be
 * used *safely* is asked when it is resolved instead, so one bad account does
 * not take the daemon down with it.
 */
function readProfiles(
  profiles: NonNullable<ConfigFile["webdav"]>,
  from: string,
): readonly WebdavProfile[] {
  const seen = new Set<string>();

  return profiles.map((profile) => {
    const at = `${from}: the webdav profile ${profile.name}`;

    if (profile.password !== undefined) {
      throw new Error(
        `${at} sets password inline, which puts a secret in a file that is backed up and pasted into issues. Use passwordFile or passwordEnv.`,
      );
    }
    if (
      (profile.passwordFile === undefined) ===
      (profile.passwordEnv === undefined)
    ) {
      throw new Error(
        `${at} must set exactly one of passwordFile and passwordEnv`,
      );
    }
    if (seen.has(profile.name)) {
      throw new Error(
        `${at} is declared twice, and a destination names one by name`,
      );
    }
    seen.add(profile.name);

    const url = new URL(profile.baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(
        `${at} is reached over ${url.protocol}, and a webdav account is reached over http or https`,
      );
    }

    return {
      name: profile.name,
      baseUrl: profile.baseUrl.replace(/\/+$/, ""),
      username: profile.username,
      ...(profile.passwordFile === undefined
        ? {}
        : { passwordFile: profile.passwordFile }),
      ...(profile.passwordEnv === undefined
        ? {}
        : { passwordEnv: profile.passwordEnv }),
    };
  });
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
    webdav: readProfiles(file.webdav, from),
    poolConfig: {
      sources: file.sources.map((source) => ({
        id: source.id as SourceId,
        autoRequest: source.autoRequest as EnrichmentName[],
      })),
      payloadTypes: file.payloadTypes.map((type) => ({
        name: type.name as PayloadTypeName,
        contentSchema: type.contentSchema as JsonSchema,
        requiredSlots: type.requiredSlots,
      })),
      enrichments: file.enrichments.map((enrichment) => ({
        name: enrichment.name as EnrichmentName,
        appliesTo: enrichment.appliesTo,
      })),
      retry: {
        maxAttempts: retry.maxAttempts,
        initialBackoff: retry.initialBackoff as Duration,
        maxBackoff: retry.maxBackoff as Duration,
      },
      sweep: {
        grace: (file.sweep?.grace ?? DEFAULT_SWEEP.graceMs) as Duration,
      },
    },
  };

  return { config, warnings: stripped };
}

export function loadConfig(
  path = process.env["NOTEMAP_CONFIG"] || defaultConfigPath(),
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
  return parseConfig(source, path);
}
