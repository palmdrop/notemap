import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import type {
  DestinationId,
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

/**
 * One destination a person configured. `kind` names the adapter; only the
 * filesystem one exists, and an unknown kind is refused rather than ignored,
 * because a destination that silently is not there is a decision that silently
 * goes nowhere.
 */
export type DestinationConfig = {
  readonly id: DestinationId;
  readonly kind: "filesystem";
  /** The folder the destination is. Never created by the daemon. */
  readonly root: string;
  readonly accepts: readonly PayloadTypeName[];
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
  readonly destinations: readonly DestinationConfig[];
  /** The cadence the delivery runner claims at. Unused where no destination is wired. */
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
  destinations: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        kind: z.enum(["filesystem"]),
        root: z.string().min(1),
        accepts: z.array(z.string()).optional(),
      }),
    )
    .default([]),
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

export function parseConfig(source: string, from: string): DaemonConfig {
  let raw: unknown;
  try {
    raw = parseToml(source);
  } catch (cause) {
    throw new Error(`${from} is not valid TOML: ${String(cause)}`, { cause });
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${from} is not a notemap config: ${where}`);
  }

  const file = parsed.data;
  const retry = file.retry ?? DEFAULT_RETRY;

  // Every payload type has a rendering — the fenced-JSON fallback is the floor —
  // so a filesystem destination that was not told what it takes takes everything
  // the pool knows about, rather than silently refusing an image.
  const everyPayloadType = file.payloadTypes.map(
    (type) => type.name as PayloadTypeName,
  );

  return {
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
    destinations: file.destinations.map((destination) => ({
      id: destination.id as DestinationId,
      kind: destination.kind,
      root: resolve(expandHome(destination.root)),
      accepts:
        (destination.accepts as PayloadTypeName[] | undefined) ??
        everyPayloadType,
    })),
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
}

export function loadConfig(path = defaultConfigPath()): DaemonConfig {
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
