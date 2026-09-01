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
