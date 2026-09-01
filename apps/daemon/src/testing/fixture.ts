import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hono } from "hono";

import type {
  AssetId,
  BlobStore,
  Destination,
  Duration,
  PayloadTypeName,
  Pool,
  PoolConfig,
  SourceId,
} from "@notemap/core";

import { createApp } from "../app";
import { createLoginThrottle, type Throttle } from "../auth/throttle";
import type { CookieOptions } from "../auth/sessions/config";
import type { Auth } from "../auth/types";
import type { AppEnv } from "../types";
import { startSweeper } from "../assets/sweeper";
import { DEFAULT_MAX_UPLOAD_BYTES } from "../constants";
import { startDeliveryRunner } from "../destinations/runner";
import { startMirrorRunner } from "../mirror/runner";
import { openPool, systemClock } from "../ports";

export const WEB = "web" as SourceId;
export const TEXT = "text" as PayloadTypeName;

/** The example config, as core takes it. */
export const CONFIG: PoolConfig = {
  sources: [{ id: WEB, autoRequest: [] }],
  payloadTypes: [
    {
      name: TEXT,
      contentSchema: {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: { text: { type: "string", minLength: 1 } },
      },
      requiredSlots: [],
    },
  ],
  enrichments: [],
  retry: {
    maxAttempts: 5,
    initialBackoff: 1000 as Duration,
    maxBackoff: 60_000 as Duration,
  },
  sweep: { grace: 86_400_000 as Duration },
};

/** Uploads bytes the way a client does — under an id it minted — and answers the response. */
export async function put(
  app: Hono<AppEnv>,
  content: string | Uint8Array,
  headers: Record<string, string>,
  id: string = randomUUID(),
): Promise<Response> {
  return app.request(`/v1/assets/${id}`, {
    method: "PUT",
    headers,
    body: content,
  });
}

export type Daemon = {
  readonly app: Hono<AppEnv>;
  /** Reachable so a test can set up pool state `/v1` has no route for yet. */
  readonly pool: Pool;
  /** Where the mirror would write, whether or not one is wired. */
  readonly mirrorRoot: string;
  /** Where blobs land. */
  readonly assetRoot: string;
  /** The folder a wired destination writes into, whether or not it exists. */
  readonly vaultRoot: string;
  readonly blobs: BlobStore;
  /** Runs every claimable mirror job now. Zero when no mirror is wired. */
  readonly drain: () => Promise<number>;
  /** Runs every claimable delivery now. Zero when nothing is owed. */
  readonly deliver: () => Promise<number>;
  /** Runs a sweep now, whatever the timer would have done. */
  readonly sweep: () => Promise<readonly AssetId[]>;
  readonly cleanup: () => Promise<void>;
};

/**
 * Neither loop is driven by its timer: a test that waits for a poll is a test
 * that fails on a slow machine.
 */
const NEVER_POLLS = 60 * 60 * 1000;

/** What the daemon is before anyone sets a password: every request passes. */
const noAuth = {
  requiresCredentials: async () => false,
} as Auth;

export type DaemonOptions = {
  readonly mirroring?: boolean;
  /** Absent leaves the door open, which is what a daemon with no credential set does. */
  readonly auth?: Auth;
  /**
   * Absent counts against the wall clock, which no test reaches the threshold
   * of. A test about the throttle itself brings one it can move.
   */
  readonly throttle?: Throttle;
  readonly maxUploadBytes?: number;
  /** Absent is the loopback daemon: `Secure` off over the fixture's plain HTTP, and no prefix. */
  readonly cookies?: CookieOptions;
  /**
   * Makes the folder `vaultRoot` names before the pool opens. Leaving it out is
   * a case rather than an omission: it is what an unmounted drive looks like.
   */
  readonly vault?: "ready" | "missing";
};

export function daemon(
  config: PoolConfig = CONFIG,
  options: DaemonOptions = {},
): Daemon {
  const directory = mkdtempSync(join(tmpdir(), "notemap-daemon-"));
  // The pool's own state is confined to its own subtree, sibling to the vault
  // rather than its parent — otherwise every vault a test points at is nested
  // under `dirname(pool.db)` and refused as overlapping notemap's own state.
  const stateRoot = join(directory, "state");
  const mirrorRoot = join(stateRoot, "pool-mirror");
  const assetRoot = join(stateRoot, "assets");
  const vaultRoot = join(directory, "vault");
  mkdirSync(stateRoot, { recursive: true });
  if (options.vault === "ready") mkdirSync(vaultRoot, { recursive: true });

  const { pool, blobs, mirrorWriter, destinations } = openPool({
    file: join(stateRoot, "pool.db"),
    config,
    assetRoot,
    ...(options.mirroring === true ? { mirrorRoot } : {}),
  });

  const runner =
    mirrorWriter === undefined
      ? undefined
      : startMirrorRunner(pool, mirrorWriter, {
          pollIntervalMs: NEVER_POLLS,
          leaseForMs: 60_000 as Duration,
          batch: 16,
        });

  const deliveries = startDeliveryRunner(pool, destinations, {
    pollIntervalMs: NEVER_POLLS,
    leaseForMs: 60_000 as Duration,
    batch: 16,
  });

  const sweeper = startSweeper(pool, { intervalMs: NEVER_POLLS });

  const app = createApp(pool, {
    limits: {
      maxUploadBytes: options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    },
    auth: options.auth ?? noAuth,
    cookies: options.cookies ?? { secure: false, prefixed: false },
    throttle: options.throttle ?? createLoginThrottle({ clock: systemClock }),
  });
  const answered = trackResponses(app);

  return {
    app,
    pool,
    mirrorRoot,
    assetRoot,
    vaultRoot,
    blobs,
    drain: async () => (await runner?.drain()) ?? 0,
    deliver: () => deliveries.drain(),
    sweep: () => sweeper.run(),
    cleanup: async () => {
      await answered.close();
      await runner?.stop();
      await deliveries.stop();
      await sweeper.stop();
      await pool.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A filesystem destination over the daemon's own `vaultRoot`, created the way a person does. */
export async function createVault(
  host: Daemon,
  overrides: { name?: string; root?: string } = {},
): Promise<Destination> {
  const created = await host.pool.destinations.create({
    name: overrides.name ?? "Vault",
    kind: "filesystem" as Destination["kind"],
    settings: { root: overrides.root ?? host.vaultRoot },
  });

  if (created.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(created.refusal)}`);
  }
  return created.value;
}

/**
 * An asset's bytes are streamed off an open file, and a body nobody reads holds
 * that descriptor until the collector gets to it — which Node reports as an
 * error, in whichever test happened to be running. A test asserting on headers
 * has no reason to read the body, so the fixture cancels what it left.
 */
function trackResponses(app: Hono<AppEnv>): { close: () => Promise<void> } {
  const answered = new Set<Response>();
  const request = app.request.bind(app);

  app.request = async (...args: Parameters<typeof request>) => {
    const response = await request(...args);
    answered.add(response);
    return response;
  };

  return {
    close: async () => {
      const unread = [...answered].filter(
        (response) => !response.bodyUsed && response.body !== null,
      );
      answered.clear();
      await Promise.all(unread.map((response) => response.body?.cancel()));
    },
  };
}

type EnvelopeOverrides = {
  readonly id?: string;
  readonly source?: string;
  readonly sourceItemId?: string;
  readonly text?: string;
  readonly capturedAt?: string;
  readonly tags?: readonly string[];
};

export function envelope(overrides: EnvelopeOverrides = {}) {
  const id = overrides.id ?? "0198f0c2-0000-7000-8000-000000000001";
  return {
    id,
    source: overrides.source ?? WEB,
    sourceItemId: overrides.sourceItemId ?? id,
    capturedAt: overrides.capturedAt ?? "2026-08-08T09:00:00.000Z",
    payload: {
      type: TEXT,
      content: { text: overrides.text ?? "a thought" },
      metadata: {},
      assets: [],
    },
    ...(overrides.tags === undefined ? {} : { tags: overrides.tags }),
  };
}

export async function post(
  app: Hono<AppEnv>,
  body: unknown,
): Promise<Response> {
  return app.request("/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A decision a client posts: the body is optional, as those routes declare it. */
export async function send(
  app: Hono<AppEnv>,
  path: string,
  content?: unknown,
): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(content === undefined ? {} : { body: JSON.stringify(content) }),
  });
}

export type Slice = { values: { id: string }[]; next?: string };

/** A paginated read that must have succeeded, since no test asserts about a page it failed to get. */
export async function slice(app: Hono<AppEnv>, url: string): Promise<Slice> {
  const response = await app.request(url);
  if (response.status !== 200) {
    throw new Error(`${url}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as Slice;
}

export const ids = (page: Slice) => page.values.map((item) => item.id);

/** Captures `count` items one minute apart, oldest first, and returns their ids. */
export async function captureMany(
  app: Hono<AppEnv>,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `0198f0c2-0000-7000-8000-00000000000${index}`;
    const response = await post(
      app,
      envelope({ id, capturedAt: `2026-08-08T09:0${index}:00.000Z` }),
    );
    if (response.status !== 201) {
      throw new Error(`capture failed: ${await response.text()}`);
    }
    ids.push(id);
  }
  return ids;
}
