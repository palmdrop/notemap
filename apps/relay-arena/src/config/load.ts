import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { DEFAULT_POLL_MS, DEFAULT_POOL_URL, MIN_POLL_MS } from "../constants";

/** Where a token is read from. Never the config file itself. */
export type Secret = { readonly file: string } | { readonly env: string };

export type WatchedChannel = {
  /** The channel's numeric id or its slug, sent to are.na verbatim. */
  readonly handle: string;
  /** How the pool sees this channel. One per channel, never one per relay. */
  readonly source: string;
  readonly tags: readonly string[];
};

export type RelayConfig = {
  readonly pool: {
    /** The daemon's base URL, without a trailing slash. */
    readonly url: string;
    readonly token: Secret;
  };
  readonly arena: {
    readonly token: Secret;
  };
  /** At least one, each with a source found on no other channel. */
  readonly channels: readonly WatchedChannel[];
  readonly poll: {
    readonly intervalMs: number;
  };
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
      ...secretKeys,
    })
    .optional(),
  arena: z.strictObject({
    ...secretKeys,
  }),
  channel: z
    .array(
      z.strictObject({
        handle: z.string().min(1),
        source: z.string().min(1),
        tags: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
  poll: z
    .strictObject({
      interval: z
        .number()
        .int()
        .min(
          MIN_POLL_MS,
          `must be at least ${String(MIN_POLL_MS)} milliseconds: are.na asks not to be polled hard`,
        )
        .optional(),
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
    throw new Error(`${from} is not an arena relay config: ${where}`);
  }

  const file = parsed.data;
  const channels = file.channel ?? [];
  if (channels.length === 0) {
    throw new Error(`${from} configures no [[channel]] to watch`);
  }

  const sources = new Set<string>();
  const handles = new Set<string>();
  for (const channel of channels) {
    // Two channels under one source would merge two channels' blocks into
    // one identity.
    if (sources.has(channel.source)) {
      throw new Error(
        `${from}: source "${channel.source}" is configured for more than one channel`,
      );
    }
    sources.add(channel.source);

    if (handles.has(channel.handle)) {
      throw new Error(
        `${from}: channel "${channel.handle}" is configured more than once`,
      );
    }
    handles.add(channel.handle);
  }

  return {
    pool: {
      url: (file.pool?.url ?? DEFAULT_POOL_URL).replace(/\/+$/, ""),
      token: readSecretKeys(file.pool ?? {}, `${from}: the pool token`),
    },
    arena: {
      token: readSecretKeys(file.arena, `${from}: the arena token`),
    },
    channels: channels.map((channel) => ({
      handle: channel.handle,
      source: channel.source,
      tags: channel.tags ?? [],
    })),
    poll: { intervalMs: file.poll?.interval ?? DEFAULT_POLL_MS },
  };
}

export function loadConfig(
  path = process.env["NOTEMAP_RELAY_ARENA_CONFIG"] || defaultConfigPath(),
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
  return parseConfig(source, path);
}

export function defaultConfigPath(): string {
  const configured = process.env["XDG_CONFIG_HOME"];
  return join(
    configured && configured.startsWith("/")
      ? configured
      : join(homedir(), ".config"),
    "notemap",
    "relay-arena.toml",
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
