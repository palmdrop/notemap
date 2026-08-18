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
  readonly host: string;
  readonly port: number;
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
const fileSchema = z.strictObject({
  daemon: z
    .strictObject({
      pool: z.string().optional(),
      host: z.string().min(1).optional(),
      port: z.number().int().min(1).max(65535).optional(),
    })
    .optional(),
  mirror: z
    .strictObject({
      root: z.string().min(1),
      pollInterval: z.number().int().positive().optional(),
      leaseFor: z.number().int().positive().optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
  retry: z
    .strictObject({
      maxAttempts: z.number().int().positive(),
      initialBackoff: z.number().int().nonnegative(),
      maxBackoff: z.number().int().nonnegative(),
    })
    .optional(),
  assets: z
    .strictObject({
      root: z.string().min(1).optional(),
      maxUpload: z.number().int().positive().optional(),
    })
    .optional(),
  sweep: z
    .strictObject({
      grace: z.number().int().nonnegative().optional(),
      interval: z.number().int().positive().optional(),
    })
    .optional(),
  delivery: z
    .strictObject({
      pollInterval: z.number().int().positive().optional(),
      leaseFor: z.number().int().positive().optional(),
      batch: z.number().int().positive().optional(),
    })
    .optional(),
  sources: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        autoRequest: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  payloadTypes: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        contentSchema: jsonSchema,
        requiredSlots: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  enrichments: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        appliesTo: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

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

/**
 * The config, and what the daemon ignored in it. An unrecognised key is a
 * warning rather than a refusal — an upgrade or a downgrade must never leave
 * the daemon unable to start over a block it does not know — but a key it does
 * know, with a value it cannot honour, still refuses.
 */
export type LoadedConfig = {
  readonly config: DaemonConfig;
  /** Every key that was dropped, by name. */
  readonly warnings: readonly string[];
};

type ConfigFile = z.infer<typeof fileSchema>;

/**
 * Strips what the schema does not know and says what it stripped. Zod names
 * unrecognised keys itself, so the report and the schema cannot drift apart the
 * way a hand-written mirror of the schema would.
 */
function tolerate(
  raw: unknown,
  from: string,
): { file: ConfigFile; stripped: readonly string[] } {
  const stripped: string[] = [];
  let candidate = raw;

  // Each pass removes at least one key, and a pass with none to remove returns.
  for (;;) {
    const parsed = fileSchema.safeParse(candidate);
    if (parsed.success) return { file: parsed.data, stripped };

    const unrecognised = parsed.error.issues.filter(
      (issue) => issue.code === "unrecognized_keys",
    );
    if (unrecognised.length === 0) {
      const where = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new Error(`${from} is not a notemap config: ${where}`);
    }

    for (const issue of unrecognised) {
      for (const key of issue.keys) {
        stripped.push([...issue.path, key].join("."));
      }
      candidate = withoutKeys(candidate, issue.path, issue.keys);
    }
  }
}

/** A copy with those keys gone from that path, leaving everything else alone. */
function withoutKeys(
  value: unknown,
  path: readonly PropertyKey[],
  keys: readonly string[],
): unknown {
  if (path.length === 0) {
    const held = { ...(value as Record<string, unknown>) };
    for (const key of keys) delete held[key];
    return held;
  }

  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    return value.map((each, at) =>
      at === head ? withoutKeys(each, rest, keys) : each,
    );
  }

  const held = value as Record<string, unknown>;
  return {
    ...held,
    [head as string]: withoutKeys(held[head as string], rest, keys),
  };
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

  const config: DaemonConfig = {
    pool: resolve(expandHome(file.daemon?.pool ?? defaultPoolPath())),
    host: file.daemon?.host ?? DEFAULT_HOST,
    port: file.daemon?.port ?? DEFAULT_PORT,
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

export function loadConfig(path = defaultConfigPath()): LoadedConfig {
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
