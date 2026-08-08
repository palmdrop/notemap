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

export type DaemonConfig = {
  /** The SQLite file the pool lives in. */
  readonly pool: string;
  readonly port: number;
  readonly poolConfig: PoolConfig;
};

const DEFAULT_PORT = 4747;

const jsonSchema = z.record(z.string(), z.unknown());

/**
 * Keys are core's names verbatim, so a reader of `core.md` can write this file
 * without a translation table. Absent lists mean empty rather than invalid: a
 * pool with no enrichments configured is an ordinary pool.
 */
const fileSchema = z.strictObject({
  daemon: z
    .strictObject({
      pool: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
    })
    .optional(),
  retry: z
    .strictObject({
      maxAttempts: z.number().int().positive(),
      initialBackoff: z.number().int().nonnegative(),
      maxBackoff: z.number().int().nonnegative(),
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

const DEFAULT_RETRY = {
  maxAttempts: 5,
  initialBackoff: 1000,
  maxBackoff: 60_000,
};

/** `~` is the shell's, not the filesystem's, so a config file has to be told. */
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

export function defaultPoolPath(): string {
  return join(xdg("XDG_DATA_HOME", ".local/share"), "notemap", "pool.db");
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

  return {
    pool: resolve(expandHome(file.daemon?.pool ?? defaultPoolPath())),
    port: file.daemon?.port ?? DEFAULT_PORT,
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
