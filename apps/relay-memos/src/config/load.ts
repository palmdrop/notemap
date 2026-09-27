import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import {
  DEFAULT_LOG,
  LOG_FORMATS,
  LOG_LEVELS,
  levelFrom,
  type LogConfig,
} from "@notemap/log";

import {
  DEFAULT_POLL_MS,
  DEFAULT_POOL_URL,
  DEFAULT_SOURCE,
  LOG_LEVEL_VARIABLE,
} from "../constants";

/** Where a token is read from. Never the config file itself. */
export type Secret = { readonly file: string } | { readonly env: string };

export type RelayConfig = {
  readonly pool: {
    /** The daemon's base URL, without a trailing slash. */
    readonly url: string;
    readonly token: Secret;
    /** How the pool sees this relay: one source per Memos server. */
    readonly source: string;
  };
  readonly memos: {
    /** The Memos server's base URL, without a trailing slash. */
    readonly url: string;
    readonly token: Secret;
    /** Whether a foot of `#tags` on a memo is read as tags and taken off the prose. */
    readonly hashtags: boolean;
  };
  readonly poll: {
    readonly intervalMs: number;
  };
  readonly log: LogConfig;
};

const secretKeys = {
  tokenFile: z.string().min(1).optional(),
  tokenEnv: z.string().min(1).optional(),
  // Known so it can be refused by name rather than dropped as a key nobody
  // recognises, which would leave the secret in the file and the relay running.
  token: z.string().optional(),
};

/**
 * Strict where the daemon's loader is tolerant: this file has a dozen keys and
 * one job, so an unrecognised one is a typo worth refusing rather than a key
 * from a newer version worth ignoring.
 */
const fileSchema = z.strictObject({
  pool: z
    .strictObject({
      url: z.string().url().optional(),
      source: z.string().min(1).optional(),
      ...secretKeys,
    })
    .optional(),
  memos: z.strictObject({
    url: z.string().url(),
    hashtags: z.boolean().optional(),
    ...secretKeys,
  }),
  poll: z
    .strictObject({
      interval: z.number().int().positive().optional(),
    })
    .optional(),
  log: z
    .strictObject({
      level: z.enum(LOG_LEVELS).optional(),
      format: z.enum(LOG_FORMATS).optional(),
    })
    .optional(),
});

type SecretKeys = {
  tokenFile?: string | undefined;
  tokenEnv?: string | undefined;
  token?: string | undefined;
};

function readSecretKeys(keys: SecretKeys, at: string): Secret {
  if (keys.token !== undefined) {
    throw new Error(
      `${at} sets token inline, which puts a secret in a file that is backed up and pasted into issues. Use tokenFile or tokenEnv.`,
    );
  }
  if ((keys.tokenFile === undefined) === (keys.tokenEnv === undefined)) {
    throw new Error(`${at} must set exactly one of tokenFile and tokenEnv`);
  }

  return keys.tokenFile === undefined
    ? { env: keys.tokenEnv as string }
    : { file: resolve(expandHome(keys.tokenFile)) };
}

/** `~` is the shell's, not the filesystem's. */
function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? join(homedir(), path.slice(1))
    : path;
}

export function parseConfig(source: string, from: string): RelayConfig {
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
    throw new Error(`${from} is not a memos relay config: ${where}`);
  }

  const file = parsed.data;

  return {
    pool: {
      url: (file.pool?.url ?? DEFAULT_POOL_URL).replace(/\/+$/, ""),
      token: readSecretKeys(file.pool ?? {}, `${from}: the pool token`),
      source: file.pool?.source ?? DEFAULT_SOURCE,
    },
    memos: {
      url: file.memos.url.replace(/\/+$/, ""),
      token: readSecretKeys(file.memos, `${from}: the memos token`),
      hashtags: file.memos.hashtags ?? false,
    },
    poll: { intervalMs: file.poll?.interval ?? DEFAULT_POLL_MS },
    log: {
      level: file.log?.level ?? DEFAULT_LOG.level,
      format: file.log?.format ?? DEFAULT_LOG.format,
    },
  };
}

/**
 * The one setting the environment may override: a container is easier to turn
 * up to `debug` from its compose file than by editing the config inside it.
 */
export function withEnvironment(
  config: RelayConfig,
  env: NodeJS.ProcessEnv,
): RelayConfig {
  const level = levelFrom(LOG_LEVEL_VARIABLE, env);
  return level === undefined
    ? config
    : { ...config, log: { ...config.log, level } };
}

export function loadConfig(
  path = process.env["NOTEMAP_RELAY_MEMOS_CONFIG"] || defaultConfigPath(),
): RelayConfig {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `no config at ${path}. Copy config.example.toml there, or pass --config <path>.`,
      { cause },
    );
  }
  return withEnvironment(parseConfig(source, path), process.env);
}

export function defaultConfigPath(): string {
  const configured = process.env["XDG_CONFIG_HOME"];
  return join(
    configured && configured.startsWith("/")
      ? configured
      : join(homedir(), ".config"),
    "notemap",
    "relay-memos.toml",
  );
}

/**
 * Read where it is used rather than held from startup, so rotating a token is
 * writing the file it lives in and never restarting the relay.
 */
export function readSecret(secret: Secret, what: string): string {
  if ("env" in secret) {
    const held = process.env[secret.env];
    if (held === undefined || held.trim() === "") {
      throw new Error(`${what} is read from ${secret.env}, which is not set`);
    }
    return held.trim();
  }

  let held: string;
  try {
    held = readFileSync(secret.file, "utf8");
  } catch (cause) {
    throw new Error(`${what} cannot be read from ${secret.file}`, { cause });
  }
  if (held.trim() === "") {
    throw new Error(`${what} is read from ${secret.file}, which is empty`);
  }
  return held.trim();
}
