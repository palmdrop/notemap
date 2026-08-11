import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hono } from "hono";

import type {
  Duration,
  PayloadTypeName,
  PoolConfig,
  SourceId,
} from "@notemap/core";

import { createApp } from "../app";
import { startMirrorRunner } from "../mirror/runner";
import { openPool } from "../ports";

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
};

export type Daemon = {
  readonly app: Hono;
  /** Where the mirror would write, whether or not one is wired. */
  readonly mirrorRoot: string;
  /** Runs every claimable mirror job now. Zero when no mirror is wired. */
  readonly drain: () => Promise<number>;
  readonly cleanup: () => Promise<void>;
};

/**
 * The runner is driven by hand rather than by its timer: a test that waits for
 * a poll is a test that fails on a slow machine.
 */
const NEVER_POLLS = 60 * 60 * 1000;

export function daemon(config: PoolConfig = CONFIG, mirroring = false): Daemon {
  const directory = mkdtempSync(join(tmpdir(), "notemap-daemon-"));
  const mirrorRoot = join(directory, "pool-mirror");
  const { pool, mirrorWriter } = openPool(
    join(directory, "pool.db"),
    config,
    mirroring ? mirrorRoot : undefined,
  );

  const runner =
    mirrorWriter === undefined
      ? undefined
      : startMirrorRunner(pool, mirrorWriter, {
          pollIntervalMs: NEVER_POLLS,
          leaseForMs: 60_000 as Duration,
          batch: 16,
        });

  return {
    app: createApp(pool),
    mirrorRoot,
    drain: async () => (await runner?.drain()) ?? 0,
    cleanup: async () => {
      await runner?.stop();
      await pool.close();
      rmSync(directory, { recursive: true, force: true });
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

export async function post(app: Hono, body: unknown): Promise<Response> {
  return app.request("/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Captures `count` items one minute apart, oldest first, and returns their ids. */
export async function captureMany(app: Hono, count: number): Promise<string[]> {
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
